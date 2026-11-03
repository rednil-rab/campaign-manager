interface SecrecyFieldsProps {
  known: boolean;
  secret: string;
  onKnownChange: (known: boolean) => void;
  onSecretChange: (secret: string) => void;
}

/** DM-only controls: whether players know about a record, and the truth behind it. */
export function SecrecyFields({ known, secret, onKnownChange, onSecretChange }: SecrecyFieldsProps) {
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={known} onChange={(e) => onKnownChange(e.target.checked)} />
        Known to players
      </label>
      <label className="field">
        Secret (DM only)
        <textarea
          className="input"
          rows={3}
          maxLength={5000}
          value={secret}
          onChange={(e) => onSecretChange(e.target.value)}
        />
      </label>
    </>
  );
}
