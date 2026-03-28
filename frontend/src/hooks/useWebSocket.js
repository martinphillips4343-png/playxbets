/**
 * WebSocket Hook for Real-Time Updates — Optimized
 * 
 * - WebSocket is PRIMARY for live updates
 * - Polling is FALLBACK only when WS is down
 * - Timestamp-based deduplication prevents stale data overwrites
 * - Delta-aware: only updates changed data
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// Configuration
const WS_RECONNECT_DELAY = 2000;
const WS_MAX_RETRIES = 10;
const FALLBACK_POLL_INTERVAL = 5000;  // 5s fallback when WS is down

/**
 * Core WebSocket connection hook
 */
export function useWebSocket(url) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const retriesRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const wsUrl = url.replace('https://', 'wss://').replace('http://', 'ws://');
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        retriesRef.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Attach receive timestamp for dedup
          data._receivedAt = Date.now();
          setLastMessage(data);
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      wsRef.current.onclose = (event) => {
        setIsConnected(false);
        if (retriesRef.current < WS_MAX_RETRIES) {
          retriesRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, WS_RECONNECT_DELAY);
        } else {
          setError('Max retries reached');
        }
      };

      wsRef.current.onerror = () => {
        setError('WebSocket error');
      };
    } catch (e) {
      setError('Failed to connect');
    }
  }, [url]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) {
      wsRef.current.close(1000, 'Intentional disconnect');
      wsRef.current = null;
    }
    setIsConnected(false);
    retriesRef.current = WS_MAX_RETRIES;
  }, []);

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { isConnected, lastMessage, error, sendMessage, disconnect, reconnect: connect };
}

/**
 * Hook for live matches list — deduplicates WS + polling
 */
export function useLiveMatches(backendUrl) {
  const [matches, setMatches] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [usePolling, setUsePolling] = useState(false);
  const lastWsTimestampRef = useRef(0); // Dedup: last WS update timestamp

  const wsUrl = `${backendUrl}/api/ws`.replace('https://', 'wss://').replace('http://', 'ws://');
  const { isConnected: wsConnected, lastMessage, error } = useWebSocket(wsUrl);

  // Handle WebSocket messages — with timestamp dedup
  useEffect(() => {
    if (!lastMessage) return;
    const msgTime = lastMessage._receivedAt || Date.now();

    // Dedup: ignore if older than last processed message
    if (msgTime < lastWsTimestampRef.current) return;
    lastWsTimestampRef.current = msgTime;

    if (lastMessage.type === 'connected') {
      setMatches(lastMessage.live_matches || []);
      setLastUpdate(new Date(lastMessage.timestamp));
      setIsConnected(true);
    } else if (lastMessage.type === 'live_matches') {
      // Delta-merge: only update matches that actually changed
      setMatches(prev => {
        const incoming = lastMessage.matches || [];
        if (prev.length === 0) return incoming;

        const incomingMap = new Map(incoming.map(m => [m.match_id, m]));
        const prevMap = new Map(prev.map(m => [m.match_id, m]));

        let hasChanges = false;
        // Check if any match data actually changed
        for (const [id, newM] of incomingMap) {
          const oldM = prevMap.get(id);
          if (!oldM ||
              oldM.status !== newM.status ||
              oldM.home_odds !== newM.home_odds ||
              oldM.away_odds !== newM.away_odds ||
              JSON.stringify(oldM.score) !== JSON.stringify(newM.score)) {
            hasChanges = true;
            break;
          }
        }
        if (incomingMap.size !== prevMap.size) hasChanges = true;

        return hasChanges ? incoming : prev;
      });
      setLastUpdate(new Date(lastMessage.timestamp));
    } else if (lastMessage.type === 'status_change') {
      setMatches(prev => prev.map(m =>
        m.match_id === lastMessage.match_id
          ? { ...m, ...lastMessage.match, status: lastMessage.new_status }
          : m
      ));
      setLastUpdate(new Date(lastMessage.timestamp));
    }
  }, [lastMessage]);

  // Connection status
  useEffect(() => {
    setIsConnected(wsConnected);
    if (!wsConnected && error) {
      setUsePolling(true);
    } else if (wsConnected) {
      setUsePolling(false); // Stop polling when WS reconnects
    }
  }, [wsConnected, error]);

  // Fallback polling — ONLY when WebSocket is down
  useEffect(() => {
    if (!usePolling) return;

    const fetchMatches = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/matches/live`);
        const data = await response.json();
        if (data.matches) {
          setMatches(data.matches);
          setLastUpdate(new Date(data.timestamp));
        }
      } catch (e) {
        console.error('Fallback polling failed:', e);
      }
    };

    fetchMatches();
    const interval = setInterval(fetchMatches, FALLBACK_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [usePolling, backendUrl]);

  return { matches, isConnected, lastUpdate, usePolling };
}

/**
 * Hook for single match updates — with delta detection
 */
export function useMatchUpdates(backendUrl, matchId) {
  const [match, setMatch] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const lastTimestampRef = useRef(0);

  const wsUrl = `${backendUrl}/api/ws/match/${matchId}`.replace('https://', 'wss://').replace('http://', 'ws://');
  const { isConnected: wsConnected, lastMessage, error, sendMessage } = useWebSocket(wsUrl);

  // Handle WS messages with dedup
  useEffect(() => {
    if (!lastMessage) return;
    const msgTime = lastMessage._receivedAt || Date.now();
    if (msgTime < lastTimestampRef.current) return;
    lastTimestampRef.current = msgTime;

    if (lastMessage.type === 'match_subscribed' || lastMessage.type === 'match_data') {
      setMatch(lastMessage.data);
      setLastUpdate(new Date(lastMessage.timestamp || Date.now()));
    } else if (lastMessage.type === 'match_update') {
      // Delta update: only update changed fields
      setMatch(prev => {
        if (!prev) return lastMessage.data;
        const newData = lastMessage.data;
        // Check if anything meaningful changed
        if (prev.status === newData.status &&
            prev.home_odds === newData.home_odds &&
            prev.away_odds === newData.away_odds &&
            JSON.stringify(prev.score) === JSON.stringify(newData.score) &&
            JSON.stringify(prev.odds) === JSON.stringify(newData.odds)) {
          return prev; // No change — prevent re-render
        }
        return { ...prev, ...newData };
      });
      setLastUpdate(new Date(lastMessage.timestamp));
    }
  }, [lastMessage]);

  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

  // Keep-alive ping
  useEffect(() => {
    if (!wsConnected) return;
    const pingInterval = setInterval(() => {
      sendMessage({ type: 'ping' });
    }, 25000);
    return () => clearInterval(pingInterval);
  }, [wsConnected, sendMessage]);

  return { match, isConnected, lastUpdate, error };
}

export default useWebSocket;
