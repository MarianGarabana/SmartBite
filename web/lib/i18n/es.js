// All Spanish texts (lib/i18n.js), one dictionary per part of the site so they are easy to find:
// chrome: header, footer, menus, toasts and shared bits (components/Chrome.jsx, LangSync, error and 404 pages, titles)
// main: the tabs of the main page (components/SmartBite.jsx: Home, My Recipes, Make Your Meal quiz, Cart, How It Works)
// recipe: the recipe page and its dialogs (RecipePage, SharedRecipe, MealEditor, MealTags, ProductDialog, PasteRecipe)
// profile: Profile, setup, Start, Privacy, profile file and My Day (ProfilePage, SetupDialog, StartPage, PrivacyPage,
//   ProfileFileOpen, MyDay)
// lib: messages made in lib/ (errors from the model call, the import, the share link) and lib labels shown as they are
// A key in two dictionaries must have the same Spanish text (test/i18n.test.mjs).
import { ES_CHROME } from "./es-chrome.js";
import { ES_LIB } from "./es-lib.js";
import { ES_MAIN } from "./es-main.js";
import { ES_PROFILE } from "./es-profile.js";
import { ES_RECIPE } from "./es-recipe.js";

export const ES_PARTS = { chrome: ES_CHROME, main: ES_MAIN, recipe: ES_RECIPE, profile: ES_PROFILE, lib: ES_LIB };
export const ES = Object.assign({}, ...Object.values(ES_PARTS));
