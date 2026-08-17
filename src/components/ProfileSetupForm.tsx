"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveProfile,
  skipProfile,
  type ActionState,
} from "@/app/actions";
import {
  BIO_EXAMPLE,
  INTEREST_CHIPS,
  MAX_INTERESTS,
} from "@/lib/profile";
import type { Profile } from "@/lib/types";

export function ProfileSetupForm({
  profile,
  mode = "setup",
}: {
  profile: Profile;
  mode?: "setup" | "edit";
}) {
  const [saveState, saveAction, saving] = useActionState<ActionState, FormData>(
    saveProfile,
    null,
  );
  const [skipState, skipAction, skipping] = useActionState<
    ActionState,
    FormData
  >(skipProfile, null);

  useEffect(() => {
    if (mode === "setup" && (saveState?.success || skipState?.success)) {
      window.location.assign("/");
    }
  }, [mode, saveState, skipState]);
  const existingLangs = (profile.languages ?? []).filter(Boolean);
  const [languages, setLanguages] = useState(
    existingLangs.length ? existingLangs : [""],
  );
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);

  function toggleInterest(chip: string) {
    setInterests((prev) => {
      if (prev.includes(chip)) return prev.filter((item) => item !== chip);
      if (prev.length >= MAX_INTERESTS) return prev;
      return [...prev, chip];
    });
  }

  const leaving = Boolean(saveState?.success || skipState?.success);
  const busy = saving || skipping || leaving;

  return (
    <div className="stack">
      <form action={saveAction} className="panel form-grid">
        <label>
          Name
          <input
            name="display_name"
            required
            maxLength={60}
            defaultValue={profile.display_name}
            autoComplete="name"
          />
        </label>

        <label>
          Where are you from?
          <input
            name="hometown"
            maxLength={80}
            defaultValue={profile.hometown ?? ""}
            placeholder="China"
          />
        </label>
        <p className="field-hint">Optional</p>

        <fieldset className="chip-fieldset">
          <legend>Languages</legend>
          {languages.map((lang, index) => (
            <label key={index}>
              {index === 0 ? "Language" : `Another language`}
              <span className="lang-row">
                <input
                  name="languages"
                  maxLength={60}
                  value={lang}
                  placeholder={index === 0 ? "Mandarin Chinese" : ""}
                  onChange={(e) => {
                    const next = [...languages];
                    next[index] = e.target.value;
                    setLanguages(next);
                  }}
                />
                {index > 0 && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() =>
                      setLanguages(languages.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                )}
              </span>
            </label>
          ))}
          {languages.length < 6 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setLanguages([...languages, ""])}
            >
              Add another language
            </button>
          )}
          <p className="field-hint">Optional. You can add more than one.</p>
        </fieldset>

        <fieldset className="chip-fieldset">
          <legend>Interests</legend>
          <div className="interest-chips">
            {INTEREST_CHIPS.map((chip) => {
              const on = interests.includes(chip);
              return (
                <button
                  key={chip}
                  type="button"
                  className={`interest-chip ${on ? "is-on" : ""}`}
                  aria-pressed={on}
                  onClick={() => toggleInterest(chip)}
                >
                  {chip}
                </button>
              );
            })}
          </div>
          {interests.map((chip) => (
            <input key={chip} type="hidden" name="interests" value={chip} />
          ))}
          <p className="field-hint">Optional. Choose up to {MAX_INTERESTS}.</p>
        </fieldset>

        <label>
          About me
          <textarea
            name="bio"
            maxLength={600}
            rows={4}
            defaultValue={profile.bio ?? ""}
            placeholder={BIO_EXAMPLE}
          />
        </label>
        <p className="field-hint">Optional. A short note is enough.</p>

        {saveState?.error && <p className="error">{saveState.error}</p>}
        {mode === "edit" && saveState?.success && (
          <p className="success">Profile saved</p>
        )}
        {mode === "setup" && skipState?.error && (
          <p className="error">{skipState.error}</p>
        )}
        <div className="profile-setup__actions">
          <button className="btn-primary" type="submit" disabled={busy}>
            {mode === "setup" && leaving && saveState?.success
              ? "Opening…"
              : saving
                ? "Saving…"
                : "Save profile"}
          </button>
          {mode === "setup" && (
            <button
              className="btn-ghost"
              type="submit"
              form="profile-skip-form"
              disabled={busy}
            >
              {leaving && skipState?.success
                ? "Opening…"
                : skipping
                  ? "…"
                  : "Skip for now"}
            </button>
          )}
        </div>
      </form>

      {mode === "setup" && (
        <form id="profile-skip-form" action={skipAction} hidden></form>
      )}
    </div>
  );
}
