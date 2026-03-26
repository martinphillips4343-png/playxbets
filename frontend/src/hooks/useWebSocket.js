/**
 * WebSocket Hook for Real-Time Updates
 * 
 * Provides real-time match updates without polling.
 * Falls back to polling if WebSocket is unavailable.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// WebSocket configuration - OPTIMIZED FOR REAL-TIME LIVE UPDATES
const WS_RECONNECT_DELAY = 2000;  // 2 seconds - faster reconnect
const WS_MAX_RETRIES = 10;  // More retries for live matches
const FALLBACK_POLL_INTERVAL = 5000;  // 5 seconds - faster fallback polling for live scores

/**
 * Hook for connecting to the WebSocket server for real-time updates
 */
export function useWebSocket(url) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const retriesRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      // Convert HTTP URL to WebSocket URL
      const wsUrl = url.replace('https://', 'wss://').replace('http://', 'ws://');
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        retriesRef.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        
        // Attempt reconnect if not intentionally closed
        if (retriesRef.current < WS_MAX_RETRIES) {
          retriesRef.current += 1;
          console.log(`Reconnecting (attempt ${retriesRef.current})...`);
          reconnectTimeoutRef.current = setTimeout(connect, WS_RECONNECT_DELAY);
        } else {
          setError('WebSocket connection failed after maximum retries');
        }
      };

      wsRef.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
      };
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      setError('Failed to create WebSocket connection');
    }
  }, [url]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Intentional disconnect');
      wsRef.current = null;
    }
    setIsConnected(false);
    retriesRef.current = WS_MAX_RETRIES; // Prevent reconnect
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
 * Hook for real-time live matches updates
 */
export function useLiveMatches(backendUrl) {
  const [matches, setMatches] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [usePolling, setUsePolling] = useState(false);
  
  const wsUrl = `${backendUrl}/api/ws`.replace('https://', 'wss://').replace('http://', 'ws://');
  const { isConnected: wsConnected, lastMessage, error } = useWebSocket(wsUrl);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'connected') {
        setMatches(lastMessage.live_matches || []);
        setLastUpdate(new Date(lastMessage.timestamp));
        setIsConnected(true);
      } else if (lastMessage.type === 'live_matches') {
        setMatches(lastMessage.matches || []);
        setLastUpdate(new Date(lastMessage.timestamp));
      } else if (lastMessage.type === 'status_change') {
        // Update specific match status
        setMatches(prev => prev.map(m => 
          m.match_id === lastMessage.match_id 
            ? { ...m, ...lastMessage.match, status: lastMessage.new_status }
            : m
        ));
        setLastUpdate(new Date(lastMessage.timestamp));
      }
    }
  }, [lastMessage]);

  // Update connection status
  useEffect(() => {
    setIsConnected(wsConnected);
    if (!wsConnected && error) {
      // Fall back to polling if WebSocket fails
      setUsePolling(true);
    }
  }, [wsConnected, error]);

  // Fallback polling
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
 * Hook for real-time single match updates
 */
export function useMatchUpdates(backendUrl, matchId) {
  const [match, setMatch] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  const wsUrl = `${backendUrl}/api/ws/match/${matchId}`.replace('https://', 'wss://').replace('http://', 'ws://');
  const { isConnected: wsConnected, lastMessage, error, sendMessage } = useWebSocket(wsUrl);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'match_subscribed' || lastMessage.type === 'match_data') {
        setMatch(lastMessage.data);
        setLastUpdate(new Date(lastMessage.timestamp || Date.now()));
      } else if (lastMessage.type === 'match_update') {
        setMatch(lastMessage.data);
        setLastUpdate(new Date(lastMessage.timestamp));
      }
    }
  }, [lastMessage]);

  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

  // Send ping periodically to keep connection alive
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
