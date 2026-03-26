import { useState, useEffect } from "react";
import { formatIndianDateTime } from "@/utils/dateFormat";
import { Calendar, Clock } from "lucide-react";

export default function DashboardHeader({ title }) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-3 md:py-4 flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0">
      <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">{title}</h1>
      <div className="flex items-center gap-3 md:gap-6 text-gray-700">
        <div className="flex items-center gap-1 md:gap-2">
          <Calendar className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
          <span className="text-xs md:text-sm lg:text-base font-medium">
            {currentTime.toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })}
          </span>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          <Clock className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
          <span className="text-xs md:text-sm lg:text-base font-medium">
            {currentTime.toLocaleTimeString('en-IN', {
              timeZone: 'Asia/Kolkata',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
