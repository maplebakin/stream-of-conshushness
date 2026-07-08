import { useEffect, useState } from 'react';

export default function ConfirmButton({
  children,
  confirmLabel = 'Confirm',
  className = '',
  disabled = false,
  onConfirm,
  onCancel,
  resetKey = '',
  ...props
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setConfirming(false);
  }, [resetKey]);

  function handleClick(event) {
    if (disabled) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onConfirm?.(event);
    setConfirming(false);
  }

  return (
    <>
      <button
        {...props}
        type={props.type || 'button'}
        className={className}
        disabled={disabled}
        onClick={handleClick}
      >
        {confirming ? confirmLabel : children}
      </button>
      {confirming && (
        <button
          type="button"
          className={className}
          disabled={disabled}
          onClick={() => {
            setConfirming(false);
            onCancel?.();
          }}
        >
          Cancel
        </button>
      )}
    </>
  );
}
