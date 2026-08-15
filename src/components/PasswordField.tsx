"use client";

import { useState } from "react";

export function PasswordField({
  name,
  autoComplete,
  required,
  minLength,
  placeholder,
}: {
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="password-field">
      <input
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-field__toggle"
        onClick={() => setVisible((on) => !on)}
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </span>
  );
}
