import { useEffect, useRef, useState } from "react";

export function useWebSocket(url) {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!url) return;

    const socket = new WebSocket(url);
    wsRef.current = socket;

    socket.onopen = () => setIsConnected(true);
    socket.onclose = () => setIsConnected(false);
    socket.onerror = () => setIsConnected(false);
    socket.onmessage = (event) => {
      setMessages((prev) => [...prev, event.data]);
    };

    return () => {
      socket.close();
    };
  }, [url]);

  const sendMessage = (payload) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(payload);
    }
  };

  return { messages, isConnected, sendMessage };
}
