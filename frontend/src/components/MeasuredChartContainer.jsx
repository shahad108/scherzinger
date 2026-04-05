import { useEffect, useRef, useState } from 'react';

function hasPositiveSize(next, prev) {
  return next.width !== prev.width || next.height !== prev.height;
}

export default function MeasuredChartContainer({ className = '', style, children }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      const next = {
        width: element.clientWidth,
        height: element.clientHeight,
      };

      setSize((prev) => (hasPositiveSize(next, prev) ? next : prev));
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const isReady = size.width > 0 && size.height > 0;

  return (
    <div ref={containerRef} className={className} style={style}>
      {isReady ? (typeof children === 'function' ? children(size) : children) : null}
    </div>
  );
}
