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
  MAX_INTERESTS,
  OTHER_INTEREST,
  PRESET_INTERESTS,
  normalizeCustomInterest,
  splitStoredInterests,
} from "@/lib/profile";
import {
  AVATAR_COLORS,
  normalizeAvatarColor,
} from "@/lib/avatar-color";
import { chatInitial } from "@/lib/chat-presence";
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
  const [customChip, setCustomChip] = useState(storedInterests.custom);
  const [otherOn, setOtherOn] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");
  const [interestError, setInterestError] = useState<string | null>(null);
  const [avatarColor, setAvatarColor] = useState(
    normalizeAvatarColor(profile.avatar_color),
  );

  const interestUsed = interests.length + (customChip ? 1 : 0);

  function toggleInterest(chip: string) {
    setInterestError(null);
    if (chip === OTHER_INTEREST) {
      if (customChip) return;
      setOtherOn((prev) => {
        if (prev) {
          setOtherDraft("");
          return false;
        }
        if (interestUsed >= MAX_INTERESTS) return prev;
        return true;
      });
      return;
    }
    setInterests((prev) => {
      if (prev.includes(chip)) return prev.filter((item) => item !== chip);
      if (prev.length + (customChip ? 1 : 0) >= MAX_INTERESTS) return prev;
      return [...prev, chip];
    });
  }

  function addCustomInterest() {
    const value = normalizeCustomInterest(otherDraft);
    if (!value) {
      setInterestError("Please type your other interest.");
      return;
    }
    if (customChip || interestUsed >= MAX_INTERESTS) return;

    const match = PRESET_INTERESTS.find(
      (chip) => chip.toLowerCase() === value.toLowerCase(),
    );
    if (match) {
      setInterests((prev) => (prev.includes(match) ? prev : [...prev, match]));
    } else {
      setCustomChip(value);
    }
    setOtherDraft("");
    setOtherOn(false);
    setInterestError(null);
  }

  function removeCustomInterest() {
    setCustomChip("");
    setInterestError(null);
  }

  const leaving = Boolean(saveState?.success || skipState?.success);
  const busy = saving || skipping || leaving;

  return (
    <div className="stack">
      <form action={saveAction} className="panel profile-form">
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
          <h2 className="profile-form__heading">Profile color</h2>
          <p className="field-hint">
            This color is used for your letter avatar in chat and messages.
          </p>
          <input type="hidden" name="avatar_color" value={avatarColor} />
          <div className="profile-color">
            <span
              className="chat-avatar"
              style={{ background: avatarColor }}
              aria-hidden="true"
            >
              {chatInitial(profile.display_name)}
            </span>
            <div
              className="profile-color-picks"
              role="radiogroup"
              aria-label="Profile color"
            >
              {AVATAR_COLORS.map((color) => {
                const selected = color === avatarColor;
                return (
                  <button
                    key={color}
                    type="button"
                    className={`profile-color-pick${selected ? " is-selected" : ""}`}
                    style={{ background: color }}
                    aria-label={color}
                    aria-pressed={selected}
                    onClick={() => setAvatarColor(color)}
                  />
                );
              })}
            </div>
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
            {PRESET_INTERESTS.map((chip) => {
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
            {customChip && (
              <span className="interest-chip is-on interest-chip--custom">
                {customChip}
                <button
                  type="button"
                  className="interest-chip__remove"
                  aria-label={`Remove ${customChip}`}
                  onClick={removeCustomInterest}
                >
                  ×
                </button>
              </span>
            )}
            <button
              type="button"
              className={`interest-chip ${otherOn ? "is-on" : ""}`}
              aria-pressed={otherOn}
              onClick={() => toggleInterest(OTHER_INTEREST)}
            >
              {OTHER_INTEREST}
            </button>
          </div>
          {otherOn && (
            <div className="interest-other">
              <span className="interest-other__top">
                Other interest
                <span className="interest-other__count">
                  {otherDraft.length} / {CUSTOM_INTEREST_MAX}
                </span>
              </span>
              <div className="interest-other__row">
                <input
                  value={otherDraft}
                  maxLength={CUSTOM_INTEREST_MAX}
                  placeholder="Type your interest..."
                  autoComplete="off"
                  aria-label="Other interest"
                  onChange={(e) => {
                    setInterestError(null);
                    setOtherDraft(e.target.value.slice(0, CUSTOM_INTEREST_MAX));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomInterest();
                    }
                  }}
                />
                <button
                  type="button"
                  className="interest-other__add"
                  onClick={addCustomInterest}
                  disabled={!normalizeCustomInterest(otherDraft)}
                >
                  Add interest
                </button>
              </div>
            </div>
          )}
          {interests.map((chip) => (
            <input key={chip} type="hidden" name="interests" value={chip} />
          ))}
          {customChip && (
            <input type="hidden" name="interests" value={customChip} />
          )}
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
