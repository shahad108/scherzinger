export default function DemoClickable({ as: Tag = 'div', onClick, className = '', children, ...rest }) {
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(e);
    }
  };
  return (
    <Tag
      onClick={onClick}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      className={`cursor-pointer transition hover:ring-2 hover:ring-blue-400/40 rounded outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
