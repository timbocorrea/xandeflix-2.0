import { useEffect, useMemo, useState } from 'react';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';

import { FocusableButton } from '@/components/tv/FocusableButton';
import { cn } from '@/utils/cn';

const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', '/', ':'],
];

type TvKeyboardMode = 'text' | 'url';

type TvKeyboardModalProps = {
  isOpen: boolean;
  title: string;
  initialValue: string;
  mode?: TvKeyboardMode;
  returnFocusKey: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

function getKeyboardRows(mode: TvKeyboardMode) {
  if (mode === 'url') {
    return [
      ...KEY_ROWS,
      ['?', '&', '=', '_', '%', '#', '@', '+', 'BACK', 'OK'],
    ];
  }

  return [...KEY_ROWS, ['ESPAÇO', 'BACK', 'LIMPAR', 'OK']];
}

function getKeyFocusKey(rowIndex: number, keyIndex: number) {
  return `tv-keyboard-key-${rowIndex}-${keyIndex}`;
}

export function TvKeyboardModal({
  isOpen,
  title,
  initialValue,
  mode = 'text',
  returnFocusKey,
  onCancel,
  onConfirm,
}: TvKeyboardModalProps) {
  const [value, setValue] = useState(initialValue);

  const rows = useMemo(() => getKeyboardRows(mode), [mode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValue(initialValue);

    requestAnimationFrame(() => {
      setFocus(getKeyFocusKey(0, 0));
    });
  }, [initialValue, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleBackKey(event: KeyboardEvent) {
      if (
        event.key === 'Escape' ||
        event.key === 'Backspace' ||
        event.key === 'BrowserBack'
      ) {
        event.preventDefault();
        event.stopPropagation();
        cancelKeyboard();
      }
    }

    window.addEventListener('keydown', handleBackKey, true);

    return () => {
      window.removeEventListener('keydown', handleBackKey, true);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  function returnFocusToField() {
    requestAnimationFrame(() => {
      setFocus(returnFocusKey);
    });
  }

  function cancelKeyboard() {
    onCancel();
    returnFocusToField();
  }

  function confirmKeyboard() {
    onConfirm(value.trim());
    returnFocusToField();
  }

  function appendKey(key: string) {
    if (key === 'ESPAÇO') {
      setValue((currentValue) => `${currentValue} `);
      return;
    }

    if (key === 'BACK') {
      setValue((currentValue) => currentValue.slice(0, -1));
      return;
    }

    if (key === 'LIMPAR') {
      setValue('');
      return;
    }

    if (key === 'OK') {
      confirmKeyboard();
      return;
    }

    setValue((currentValue) => `${currentValue}${key}`);
  }

  function handleKeyArrow(
    direction: string,
    rowIndex: number,
    keyIndex: number,
  ) {
    if (direction === 'up') {
      const targetRow = rowIndex - 1;

      if (targetRow < 0) {
        setFocus('tv-keyboard-cancel');
        return false;
      }

      const targetKeyIndex = Math.min(keyIndex, rows[targetRow].length - 1);
      setFocus(getKeyFocusKey(targetRow, targetKeyIndex));
      return false;
    }

    if (direction === 'down') {
      const targetRow = rowIndex + 1;

      if (targetRow >= rows.length) {
        return false;
      }

      const targetKeyIndex = Math.min(keyIndex, rows[targetRow].length - 1);
      setFocus(getKeyFocusKey(targetRow, targetKeyIndex));
      return false;
    }

    if (direction === 'left') {
      if (keyIndex <= 0) {
        return false;
      }

      setFocus(getKeyFocusKey(rowIndex, keyIndex - 1));
      return false;
    }

    if (direction === 'right') {
      if (keyIndex >= rows[rowIndex].length - 1) {
        return false;
      }

      setFocus(getKeyFocusKey(rowIndex, keyIndex + 1));
      return false;
    }

    return false;
  }

  return (
    <div className="xf-tv-keyboard-modal fixed inset-0 z-[999] flex items-center justify-center bg-black/85 px-8 py-6 text-white">
      <div className="xf-tv-keyboard-panel w-full max-w-5xl rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-xf-red">
              Teclado TV
            </p>
            <h2 className="mt-3 text-3xl font-black">{title}</h2>
          </div>

          <FocusableButton
            focusKey="tv-keyboard-cancel"
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold"
            onArrowPress={(direction) => {
              if (direction === 'down') {
                setFocus(getKeyFocusKey(0, 0));
                return false;
              }

              return false;
            }}
            onEnterPress={cancelKeyboard}
            onClick={cancelKeyboard}
          >
            Cancelar
          </FocusableButton>
        </div>

        <div className="mt-5 min-h-16 rounded-xl border border-xf-red/40 bg-black px-4 py-3 font-mono text-2xl font-bold">
          {value || <span className="text-white/30">Digite aqui...</span>}
        </div>

        <div className="mt-6 space-y-3">
          {rows.map((row, rowIndex) => (
            <div
              key={`row-${rowIndex}`}
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
              }}
            >
              {row.map((key, keyIndex) => (
                <FocusableButton
                  key={`${rowIndex}-${key}`}
                  focusKey={getKeyFocusKey(rowIndex, keyIndex)}
                  className={cn(
                    'rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center text-lg font-black text-white',
                    key === 'OK' && 'bg-xf-red',
                    key === 'BACK' && 'bg-white/10',
                    key === 'LIMPAR' && 'bg-white/10',
                  )}
                  onArrowPress={(direction) =>
                    handleKeyArrow(direction, rowIndex, keyIndex)
                  }
                  onEnterPress={() => appendKey(key)}
                  onClick={() => appendKey(key)}
                >
                  {key}
                </FocusableButton>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
