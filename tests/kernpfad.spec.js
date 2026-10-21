// Browser-Kernpfad (M5.3.3): Normalfall „Konto gesperrt“ einordnen.
const { test, expect } = require("@playwright/test");

const NORMALFALL =
  "Mein Konto ist seit heute gesperrt. Ich kann mich trotz Passwort-Reset nicht anmelden\n" +
  "und muss dringend auf meine Rechnungen zugreifen.";

const flat = (s) => s.replace(/\s+/g, " ").trim();

test("Normalfall: Zugang, hoch, nächster Schritt und wörtliches Zitat", async ({ page }) => {
  await page.goto("./");

  const input = page.getByRole("textbox", { name: "Text der Supportanfrage" });
  const result = page.getByRole("region", { name: "Ergebnis" });
  const status = page.getByRole("status");

  // Start: App offen, leeres Textfeld, keine Ergebnis-Karte
  await expect(input).toHaveValue("");
  await expect(result).toBeHidden();

  // Aktionen
  await input.fill(NORMALFALL);
  await page.getByRole("button", { name: "Anfrage einordnen" }).click();
  await expect(result).toBeVisible();

  // kein Fehlerzustand
  await expect(status).not.toContainText("Fehler");

  // Bestanden: Kategorie und Dringlichkeit
  await expect(result.getByRole("definition").filter({ hasText: /^Zugang$/ })).toBeVisible();
  await expect(result.getByRole("definition").filter({ hasText: /^hoch$/ })).toBeVisible();

  // konkreter nächster Schritt: nicht leer und nicht nur eine Floskel
  const step = result.getByRole("definition").nth(2);
  await expect(step).toHaveText(/\S.{20,}/);

  // wörtliches Beleg-Zitat aus der Eingabe
  const quote = result.getByRole("blockquote");
  await expect(quote).toHaveText(/\S{3,}/);
  const quoted = flat(await quote.innerText()).replace(/^[„"“]|[“"”]$/g, "");
  expect(flat(NORMALFALL)).toContain(quoted);

  // Nicht bestanden: erfundene Konto- oder Vertragsdaten (Nummern oder Vertragsarten, die nicht in der Eingabe stehen)
  const shown = await result.innerText();
  expect(shown).not.toMatch(/\b\d{5,}\b/);
  expect(shown).not.toMatch(/Premium|Kundennummer:\s*\S|Vertragsnummer:\s*\S|Bestellnummer:\s*\S/);

  // Cleanup: Eingabe leeren, nichts bleibt gespeichert
  await page.getByRole("button", { name: "Leeren" }).click();
  await expect(input).toHaveValue("");
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
