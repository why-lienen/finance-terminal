import { ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ open, title, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,28,42,.45)', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="card modal-panel"
        style={{ width: 'min(880px, 96vw)', maxHeight: '92vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="danger" onClick={onClose}>关闭</button>
        </div>
        {children}
      </div>
    </div>
  );
}
