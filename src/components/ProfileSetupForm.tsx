"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveProfile,
  skipProfile,
  type ActionState,
} from "@/app/actions";
import {
  BIO_EXAMPLE,
  CUSTOM_INTEREST_MAX,
  INTEREST_CHIPS,
  MAX_INTERESTS,
  OTHER_INTEREST,
  normalizeCustomInterest,
  splitStoredInterests,
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
  const storedInterests = splitStoredInterests(profile.interests ?? []);
  const [interests, setInterests] = useState<string[]>(storedInterests.selected);
  const [otherOn, setOtherOn] = useState(
    Boolean(storedInterests.custom) ||
      (profile.interests ?? []).includes(OTHER_INTEREST),
  );
  const [customInterest, setCustomInterest] = useState(storedInterests.custom);
  const [interestError, setInterestError] = useState<string | null>(null);

  function toggleInterest(chip: string) {
    setInterestError(null);
    if (chip === OTHER_INTEREST) {
      setOtherOn((prev) => {
        if (prev) {
          setCustomInterest("");
          return false;
        }
        if (interests.length >= MAX_INTERESTS) return prev;
        return true;
      });
      return;
    }
    setInterests((prev) => {
      if (prev.includes(chip)) return prev.filter((item) => item !== chip);
      if (prev.length + (otherOn ? 1 : 0) >= MAX_INTERESTS) return prev;
      return [...prev, chip];
    });
  }

  const leaving = Boolean(saveState?.success || skipState?.success);
  const busy = saving || skipping || leaving;

  return (
    <div className="stack">
      <form
        action={saveAction}
        className="panel profile-form"
        onSubmit={(e) => {
          if (otherOn && !normalizeCustomInterest(customInterest)) {
            e.preventDefault();
            setInterestError("Please type your other interest.");
          }
        }}
      >
        <p className="profile-form__note">
          Everything except your name is optional.
        </p>

        <section className="profile-form__group">
          <h2 className="profile-form__heading">About you</h2>
          <div className="profile-form__pair">
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
          </div>
        </section>

        <section className="profile-form__group">
          <h2 className="profile-form__heading">Languages</h2>
          {languages.map((lang, index) => (
            <span className="lang-row" key={index}>
              <input
                name="languages"
                maxLength={60}
                value={lang}
                placeholder={index === 0 ? "Mandarin Chinese" : ""}
                aria-label={index === 0 ? "Language" : "Another language"}
                onChange={(e) => {
                  const next = [...languages];
                  next[index] = e.target.value;
                  setLanguages(next);
                }}
              />
              {index > 0 && (
                <button
                  type="button"
                  className="btn-ghost profile-form__remove-lang"
                  onClick={() =>
                    setLanguages(languages.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              )}
            </span>
          ))}
          {languages.length < 6 && (
            <button
              type="button"
              className="profile-form__add-lang"
              onClick={() => setLanguages([...languages, ""])}
            >
              + Add another language
            </button>
          )}
        </section>

        <section className="profile-form__group">
          <h2 className="profile-form__heading">Interests</h2>
          <div className="interest-chips">
            {INTEREST_CHIPS.map((chip) => {
              const on =
                chip === OTHER_INTEREST ? otherOn : interests.includes(chip);
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
          {otherOn && (
            <label className="interest-other">
              <span className="interest-other__top">
                Other interest
                <span className="interest-other__count">
                  {customInterest.length} / {CUSTOM_INTEREST_MAX}
                </span>
              </span>
              <input
                name="other_interest"
                value={customInterest}
                maxLength={CUSTOM_INTEREST_MAX}
                placeholder="Type your interest..."
                autoComplete="off"
                onChange={(e) => {
                  setInterestError(null);
                  setCustomInterest(e.target.value.slice(0, CUSTOM_INTEREST_MAX));
                }}
              />
            </label>
          )}
          {interests.map((chip) => (
            <input key={chip} type="hidden" name="interests" value={chip} />
          ))}
          {otherOn && <input type="hidden" name="other_selected" value="true" />}
          <p className="field-hint">Choose up to {MAX_INTERESTS}.</p>
          {interestError && <p className="error">{interestError}</p>}
        </section>

        <section className="profile-form__group">
          <h2 className="profile-form__heading">About me</h2>
          <textarea
            name="bio"
            maxLength={600}
            rows={4}
            defaultValue={profile.bio ?? ""}
            placeholder={BIO_EXAMPLE}
            aria-label="About me"
          />
        </section>

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
