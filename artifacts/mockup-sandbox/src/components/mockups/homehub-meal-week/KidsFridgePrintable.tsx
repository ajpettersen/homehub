import React from "react";
import { Coffee, Moon, Printer, Sun } from "lucide-react";
import { addDays, format } from "date-fns";
import "./_group.css";

type MealType = "breakfast" | "lunch" | "dinner";

const monday = new Date("2026-03-09T12:00:00");
const meals: Record<number, Partial<Record<MealType, { name: string; note?: string }>>> = {
  0: { breakfast: { name: "Overnight oats & berries" }, dinner: { name: "Chicken fajita bowls", note: "Keep peppers separate" } },
  1: { lunch: { name: "Turkey & avocado wraps" }, dinner: { name: "Lemon salmon, rice & peas" } },
  2: { breakfast: { name: "Scrambled eggs & toast" }, dinner: { name: "Emily's veggie lasagna", note: "Made ahead after pickup" } },
  3: { lunch: { name: "Leftover veggie lasagna" }, dinner: { name: "Sheet-pan chicken & vegetables" } },
  4: { breakfast: { name: "Yogurt, granola & banana" }, dinner: { name: "Family pizza night", note: "Half cheese, half mushroom" } },
  5: { lunch: { name: "Grilled cheese & tomato soup" }, dinner: { name: "Beef tacos with corn salad" } },
  6: { breakfast: { name: "Blueberry pancakes" }, dinner: { name: "Roast chicken Sunday supper", note: "5:30 before bedtime routine" } },
};

const mealMeta: { type: MealType; label: string; Icon: typeof Coffee }[] = [
  { type: "breakfast", label: "Breakfast", Icon: Coffee },
  { type: "lunch", label: "Lunch", Icon: Sun },
  { type: "dinner", label: "Dinner", Icon: Moon },
];

export function KidsFridgePrintable() {
  return (
    <section className="kids-fridge-printable">
      <div className="print-toolbar">
        <span>HomeHub · printable preview</span>
        <button type="button" onClick={() => window.print()}><Printer size={15} />Print this week</button>
      </div>
      <article className="meal-sheet" aria-label="Weekly family meal plan for March 9 through March 15, 2026">
        <header className="print-head">
          <div>
            <div className="brand-line"><span className="home-mark"><span /></span>HomeHub</div>
            <h1 className="sheet-title">What’s for dinner?</h1>
            <p className="sheet-subtitle">Our family menu · {format(monday, "MMMM d")}–{format(addDays(monday, 6), "d, yyyy")}</p>
          </div>
          <aside className="fridge-note"><strong>Pick a favorite</strong>Tell a grown-up what sounds good today.</aside>
        </header>
        <main className="meal-grid">
          {Array.from({ length: 7 }, (_, dayIndex) => {
            const date = addDays(monday, dayIndex);
            return (
              <section className={`day-card ${dayIndex === 3 ? "today" : ""}`} key={dayIndex}>
                <header className="day-head">
                  <span className="day-name">{format(date, "EEEE")}</span>
                  <span className="day-date">{format(date, "MMM d")}{dayIndex === 3 ? " · today" : ""}</span>
                </header>
                <div className="meal-stack">
                  {mealMeta.map(({ type, label, Icon }) => {
                    const meal = meals[dayIndex][type];
                    return (
                      <div className={`meal-row ${type} ${meal ? "" : "empty"}`} key={type}>
                        <span className="meal-label"><Icon />{label}</span>
                        <span className="meal-name">{meal?.name ?? "Open for an easy favorite"}</span>
                        {meal?.note && <p className="meal-note">{meal.note}</p>}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </main>
        <footer className="print-foot">
          <p className="foot-message">Made for the fridge. Read it together.</p>
          <div className="legend"><span><i style={{ background: "#fff1b9" }} />morning</span><span><i style={{ background: "#d9ebdb" }} />midday</span><span><i style={{ background: "#f1c9bc" }} />dinner</span></div>
        </footer>
      </article>
    </section>
  );
}