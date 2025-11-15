import { useEffect, useMemo, useState } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "../../../amplify/data/resource";

const client = generateClient<Schema>();

type SheetRecord = Schema["SantasSheet"]["type"];

type FormState = Record<string, string>;

const defaultFormState: FormState = {
  displayName: "",
  year: new Date().getFullYear().toString(),
  favoriteCandySnack: "",
  favoriteScents: "",
  favoriteFastFoodPlaces: "",
  favoriteRestaurants: "",
  favoriteStores: "",
  cellPhoneModel: "",
  favoriteSaying: "",
  favoriteSportsTeam: "",
  favoriteColorsTheme: "",
  favoriteLogoEmblem: "",
  anniversaryDate: "",
  favoritePlaces: "",
  clothingSizes: "",
  otherFavorites: "",
  familyDetails: "",
  wishlistTopItems: "",
  additionalNotes: "",
};

function serializeList(value?: (string | null)[] | null) {
  return (value ?? []).filter(Boolean).join("\n");
}

function parseList(value: string) {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

type SheetEditorProps = {
  sheet: SheetRecord | null;
  fallbackName: string;
};

export function SheetEditor({ sheet, fallbackName }: SheetEditorProps) {
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sheet) {
      setFormState({ ...defaultFormState, displayName: fallbackName });
      return;
    }

    setFormState({
      displayName: sheet.displayName ?? fallbackName ?? "",
      year: sheet.year?.toString() ?? new Date().getFullYear().toString(),
      favoriteCandySnack: serializeList(sheet.favoriteCandySnack),
      favoriteScents: serializeList(sheet.favoriteScents),
      favoriteFastFoodPlaces: serializeList(sheet.favoriteFastFoodPlaces),
      favoriteRestaurants: serializeList(sheet.favoriteRestaurants),
      favoriteStores: serializeList(sheet.favoriteStores),
      cellPhoneModel: sheet.cellPhoneModel ?? "",
      favoriteSaying: sheet.favoriteSaying ?? "",
      favoriteSportsTeam: sheet.favoriteSportsTeam ?? "",
      favoriteColorsTheme: sheet.favoriteColorsTheme ?? "",
      favoriteLogoEmblem: sheet.favoriteLogoEmblem ?? "",
      anniversaryDate: sheet.anniversaryDate ?? "",
      favoritePlaces: serializeList(sheet.favoritePlaces),
      clothingSizes: sheet.clothingSizes ?? "",
      otherFavorites: sheet.otherFavorites ?? "",
      familyDetails: sheet.familyDetails ?? "",
      wishlistTopItems: serializeList(sheet.wishlistTopItems),
      additionalNotes: sheet.additionalNotes ?? "",
    });
  }, [sheet, fallbackName]);

  const yearValue = formState.year || new Date().getFullYear().toString();
  const parsedYear = useMemo(() => {
    const numeric = Number.parseInt(yearValue, 10);
    return Number.isNaN(numeric) ? new Date().getFullYear() : numeric;
  }, [yearValue]);

  async function saveSheet() {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload: Partial<SheetRecord> = {
        year: parsedYear,
        displayName: formState.displayName || fallbackName,
        favoriteCandySnack: parseList(formState.favoriteCandySnack),
        favoriteScents: parseList(formState.favoriteScents),
        favoriteFastFoodPlaces: parseList(formState.favoriteFastFoodPlaces),
        favoriteRestaurants: parseList(formState.favoriteRestaurants),
        favoriteStores: parseList(formState.favoriteStores),
        cellPhoneModel: formState.cellPhoneModel,
        favoriteSaying: formState.favoriteSaying,
        favoriteSportsTeam: formState.favoriteSportsTeam,
        favoriteColorsTheme: formState.favoriteColorsTheme,
        favoriteLogoEmblem: formState.favoriteLogoEmblem,
        anniversaryDate: formState.anniversaryDate,
        favoritePlaces: parseList(formState.favoritePlaces),
        clothingSizes: formState.clothingSizes,
        otherFavorites: formState.otherFavorites,
        familyDetails: formState.familyDetails,
        wishlistTopItems: parseList(formState.wishlistTopItems),
        additionalNotes: formState.additionalNotes,
      };

      if (sheet) {
        await client.models.SantasSheet.update({
          id: sheet.id,
          ...payload,
        });
      } else {
        await client.models.SantasSheet.create(payload);
      }

      setMessage("Saved!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sheet.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(name: keyof FormState, value: string) {
    setFormState((prev) => ({ ...prev, [name]: value }));
  }

  return (
    <section className="sheet-form">
      <div className="sheet-form__grid">
        {/* Name field */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Name:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
            value={formState.displayName ?? ""}
            onChange={(event) => updateField("displayName", event.target.value)}
          />
        </div>

        {/* Favorite candy/snack */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite candy/snack:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteCandySnack ?? ""}
            onChange={(event) => updateField("favoriteCandySnack", event.target.value)}
            placeholder="One per line"
            rows={2}
          />
        </div>

        {/* Favorite scents */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite scents:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteScents ?? ""}
            onChange={(event) => updateField("favoriteScents", event.target.value)}
            placeholder="One per line"
            rows={2}
          />
        </div>

        {/* Favorite fast food places */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite fast food places:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteFastFoodPlaces ?? ""}
            onChange={(event) => updateField("favoriteFastFoodPlaces", event.target.value)}
            placeholder="One per line"
            rows={2}
          />
        </div>

        {/* Favorite restaurants */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite restaurants:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteRestaurants ?? ""}
            onChange={(event) => updateField("favoriteRestaurants", event.target.value)}
            placeholder="One per line"
            rows={2}
          />
        </div>

        {/* Favorite stores */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite stores to shop at:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoriteStores ?? ""}
            onChange={(event) => updateField("favoriteStores", event.target.value)}
            placeholder="One per line"
            rows={2}
          />
        </div>

        {/* Cell phone model */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">What model cell phone do you have:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
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
            onChange={(event) => updateField("favoriteSaying", event.target.value)}
            rows={2}
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
          />
        </div>

        {/* Favorite places to go/do */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Favorite places to go/do:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.favoritePlaces ?? ""}
            onChange={(event) => updateField("favoritePlaces", event.target.value)}
            placeholder="One per line"
            rows={2}
          />
        </div>

        {/* Clothing sizes */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Sizes tops/bottoms:</label>
          <input
            type="text"
            className="sheet-form__answer-line"
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
            onChange={(event) => updateField("otherFavorites", event.target.value)}
            rows={2}
          />
        </div>

        {/* Family details */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Any pets/kids/grandkids/bf/gf/spouse & their names:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.familyDetails ?? ""}
            onChange={(event) => updateField("familyDetails", event.target.value)}
            rows={2}
          />
        </div>

        {/* Wishlist top items */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Any other things not mentioned/or you want/ top things on xmas list:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.wishlistTopItems ?? ""}
            onChange={(event) => updateField("wishlistTopItems", event.target.value)}
            placeholder="One per line"
            rows={2}
          />
        </div>

        {/* Additional notes */}
        <div className="sheet-form__question">
          <label className="sheet-form__question-label">Anything else you feel santa should know:</label>
          <textarea
            className="sheet-form__textarea"
            value={formState.additionalNotes ?? ""}
            onChange={(event) => updateField("additionalNotes", event.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="sheet-form__status">
        {message && <p className="success">{message}</p>}
        {error && <p className="error">Error: {error}</p>}
      </div>

      <div className="sheet-signature">
        <p>Thank you very much!</p>
        <p>Sincerely,</p>
        <strong className="mrs-claus">Mrs. Claus</strong>
        <div className="sheet-signature__actions">
          <button className="sheet-signature__button" onClick={saveSheet} disabled={saving}>
            {saving ? "Saving..." : "Save sheet"}
          </button>
        </div>
        <div className="santa-stamp" aria-hidden="true" />
      </div>
    </section>
  );
}
