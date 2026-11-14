import { useEffect, useRef, useState } from "react";
import type { Answers } from "../../../amplify/seasonal/service";
import { apiFailure } from "../../lib/apiResults";
import { formAnswers, sheetForm, type FormState, type LegacySheet } from "./seasonal";

type SheetEditorProps = {
  sheet: (Partial<LegacySheet> & { id: string }) | null;
  fallbackName: string;
  loginId: string;
  readOnly?: boolean;
  saveAnswers?: (answers: Answers) => Promise<unknown>;
  visible?: boolean;
};

export function SheetEditor({ sheet, fallbackName, saveAnswers, readOnly = !saveAnswers, visible = true }: SheetEditorProps) {
  const [formState, setFormState] = useState<FormState>(() => sheetForm(sheet, fallbackName));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLElement>(null);
  // A changed person/year mounts a new editor. Same-sheet profile/auth refreshes
  // cannot replace unsaved answers. History is a separate, read-only instance.
  useEffect(() => {
    if (!dirty.current) setFormState(sheetForm(sheet, fallbackName));
  }, [sheet, fallbackName]);

  const autoResize = (el: HTMLTextAreaElement) => {
    if (window.matchMedia("print").matches) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    if (visible) formRef.current?.querySelectorAll<HTMLTextAreaElement>(".sheet-form__textarea").forEach(autoResize);
  }, [formState, visible]);

  async function saveSheet() {
    if (readOnly || savingRef.current || !saveAnswers) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveAnswers(formAnswers(formState));
      dirty.current = false;
      setMessage("Saved!");
    } catch (err) {
      const failure = apiFailure(err);
      setError(failure.code === "conflict"
        ? "Another save conflicts with this draft. Your edits are still here. Open your 2026 sheet in a new tab to review the saved version before continuing."
        : `${failure.safeMessage} Your edits are still here.`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  function updateField(name: keyof FormState, value: string) {
    if (readOnly || savingRef.current) return;
    dirty.current = true;
    setMessage(null);
    setFormState(prev => ({ ...prev, [name]: value }));
  }

  return (
    <section className="sheet-form" ref={formRef}>
      <fieldset className="sheet-form__grid" disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        {/* Name field */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Name:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
            value={formState.displayName ?? ""}
            onChange={(event) => updateField("displayName", event.target.value)}
            readOnly
          />
        </div>

        {/* Favorite candy/snack */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite candy/snack:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteCandySnack ?? ""}
            onChange={(event) => {
              updateField("favoriteCandySnack", event.target.value);
              autoResize(event.target);
            }}
            placeholder="One per line"
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Favorite scents */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite scents:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteScents ?? ""}
            onChange={(event) => {
              updateField("favoriteScents", event.target.value);
              autoResize(event.target);
            }}
            placeholder="One per line"
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Favorite fast food places */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite fast food places:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteFastFoodPlaces ?? ""}
            onChange={(event) => {
              updateField("favoriteFastFoodPlaces", event.target.value);
              autoResize(event.target);
            }}
            placeholder="One per line"
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Favorite restaurants */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite restaurants:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteRestaurants ?? ""}
            onChange={(event) => {
              updateField("favoriteRestaurants", event.target.value);
              autoResize(event.target);
            }}
            placeholder="One per line"
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Favorite stores */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite stores to shop at:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteStores ?? ""}
            onChange={(event) => {
              updateField("favoriteStores", event.target.value);
              autoResize(event.target);
            }}
            placeholder="One per line"
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Cell phone model */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">What model cell phone do you have:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
            readOnly={readOnly}
            value={formState.cellPhoneModel ?? ""}
            onChange={(event) => updateField("cellPhoneModel", event.target.value)}
          />
        </div>

        {/* Favorite saying/quote */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite saying/quote:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteSaying ?? ""}
            onChange={(event) => {
              updateField("favoriteSaying", event.target.value);
              autoResize(event.target);
            }}
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Favorite sports team */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite sports team:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
            value={formState.favoriteSportsTeam ?? ""}
            onChange={(event) => updateField("favoriteSportsTeam", event.target.value)}
            readOnly={readOnly}
          />
        </div>

        {/* Favorite colors/decor theme */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite colors/decor theme:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
            value={formState.favoriteColorsTheme ?? ""}
            onChange={(event) => updateField("favoriteColorsTheme", event.target.value)}
            readOnly={readOnly}
          />
        </div>

        {/* Favorite logo/emblem */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite logo/emblem:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
            value={formState.favoriteLogoEmblem ?? ""}
            onChange={(event) => updateField("favoriteLogoEmblem", event.target.value)}
            readOnly={readOnly}
          />
        </div>

        {/* Anniversary date */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">What is your anniversary date:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
            value={formState.anniversaryDate ?? ""}
            onChange={(event) => updateField("anniversaryDate", event.target.value)}
            readOnly={readOnly}
          />
        </div>

        {/* Favorite places to go/do */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite places to go/do:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoritePlaces ?? ""}
            onChange={(event) => {
              updateField("favoritePlaces", event.target.value);
              autoResize(event.target);
            }}
            placeholder="One per line"
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Clothing sizes */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Sizes tops/bottoms:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
            readOnly={readOnly}
            value={formState.clothingSizes ?? ""}
            onChange={(event) => updateField("clothingSizes", event.target.value)}
          />
        </div>

        {/* Other favorites/interests/hobbies */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Any other favorites/interests/hobbies:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.otherFavorites ?? ""}
            onChange={(event) => {
              updateField("otherFavorites", event.target.value);
              autoResize(event.target);
            }}
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Family details */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Any pets/kids/grandkids/bf/gf/spouse & their names:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.familyDetails ?? ""}
            onChange={(event) => {
              updateField("familyDetails", event.target.value);
              autoResize(event.target);
            }}
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Wishlist top items */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Any other things not mentioned/or you want/ top things on xmas list:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.wishlistTopItems ?? ""}
            onChange={(event) => {
              updateField("wishlistTopItems", event.target.value);
              autoResize(event.target);
            }}
            placeholder="One per line"
            rows={1}
            readOnly={readOnly}
          />
        </div>

        {/* Additional notes */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Anything else you feel santa should know:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.additionalNotes ?? ""}
            onChange={(event) => {
              updateField("additionalNotes", event.target.value);
              autoResize(event.target);
            }}
            rows={1}
            readOnly={readOnly}
          />
        </div>
      </fieldset>

      <div className="sheet-form__status">
        {message && <p className="success" role="status">{message}</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <div className="sheet-signature">
        <p>Thank you very much!</p>
        <p>Sincerely,</p>
        <strong className="mrs-claus">Mrs. Claus</strong>
        {!readOnly && (
          <div className="sheet-signature__actions">
            <button className="sheet-signature__button" onClick={saveSheet} disabled={saving}>
              {saving ? "Saving..." : error ? "Retry save" : "Save sheet"}
            </button>
          </div>
        )}
        <div className="santa-stamp" aria-hidden="true" />
      </div>
    </section>
  );
}
