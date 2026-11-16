import { useCallback, useId, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../components/Icon';
import {
  lineSpacings,
  steppedTextSize,
  textFonts,
  textSettings,
  usualText,
  type TextSettings as Settings,
} from './textSettings';
import { useAnchoredCard } from './useAnchoredCard';

const spacingNames: Record<Settings['spacing'], string> = {
  compact: 'Compact',
  normal: 'Normal',
  relaxed: 'Relaxed',
};
const fontNames: Record<Settings['font'], string> = { sans: 'Sans', serif: 'Serif' };

/** A row of choices, one of them taken; arrow keys move between them. */
function Choices<Value extends string>({
  label,
  name,
  values,
  names,
  value,
  onChange,
}: {
  label: string;
  name: string;
  values: readonly Value[];
  names: Record<Value, string>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="text-card-group">
      <legend className="text-card-label">{label}</legend>
      <div className="text-card-choices">
        {values.map((choice) => (
          <label key={choice} data-choice={choice}>
            <input
              type="radio"
              name={name}
              value={choice}
              checked={choice === value}
              onChange={() => onChange(choice)}
            />
            <span>{names[choice]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Sets the reader's own text size, line spacing and font for every document, from a card
 * opened in the document's details. The page shows each change at once.
 */
export default function TextButton() {
  const settings = useSyncExternalStore(textSettings.subscribe, textSettings.get);
  const [open, setOpen] = useState(false);
  const id = useId();
  const dismiss = useCallback(() => setOpen(false), []);
  const { trigger, card, close, above, cardProps } = useAnchoredCard(open, dismiss);
  const smaller = steppedTextSize(settings.size, -1);
  const larger = steppedTextSize(settings.size, 1);
  const usual = (Object.keys(usualText) as (keyof Settings)[]).every(
    (key) => settings[key] === usualText[key],
  );

  return (
    <span className="article-text">
      <button
        ref={trigger}
        type="button"
        className={open ? 'is-active' : undefined}
        aria-label="Text settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="text" />
        Text
      </button>
      {open &&
        createPortal(
          <div
            ref={card}
            id={id}
            className={`reader-popover text-card${above ? ' is-above' : ''}`}
            role="dialog"
            aria-label="Text settings"
            {...cardProps}
          >
            <div className="text-card-group" role="group" aria-labelledby={`${id}-size`}>
              <span id={`${id}-size`} className="text-card-label">
                Text size
              </span>
              <div className="text-card-size">
                {/* Still focusable at either end, so the keyboard stays where it was. */}
                <button
                  type="button"
                  className="text-card-smaller"
                  aria-label="Smaller text"
                  aria-disabled={!smaller}
                  onClick={() => smaller && textSettings.set({ size: smaller })}
                >
                  A
                </button>
                <output aria-live="polite">{settings.size}%</output>
                <button
                  type="button"
                  className="text-card-larger"
                  aria-label="Larger text"
                  aria-disabled={!larger}
                  onClick={() => larger && textSettings.set({ size: larger })}
                >
                  A
                </button>
              </div>
            </div>
            <Choices
              label="Line spacing"
              name={`${id}-spacing`}
              values={lineSpacings}
              names={spacingNames}
              value={settings.spacing}
              onChange={(spacing) => textSettings.set({ spacing })}
            />
            <Choices
              label="Font"
              name={`${id}-font`}
              values={textFonts}
              names={fontNames}
              value={settings.font}
              onChange={(font) => textSettings.set({ font })}
            />
            <div className="text-card-actions">
              <button
                type="button"
                aria-disabled={usual}
                onClick={() => !usual && textSettings.set(usualText)}
              >
                Reset
              </button>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
