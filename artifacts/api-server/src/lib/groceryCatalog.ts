import { db, groceryCatalogItemsTable, type GroceryCategoryKey } from "@workspace/db";
import { sql } from "drizzle-orm";

const CATALOG_GROUPS: Record<GroceryCategoryKey, string> = {
  produce: "Apples|Avocados|Bananas|Blackberries|Blueberries|Broccoli|Brussels sprouts|Cabbage|Cantaloupe|Carrots|Cauliflower|Celery|Cherries|Cilantro|Corn|Cucumbers|Garlic|Ginger|Grapefruit|Grapes|Green beans|Green onions|Jalapeños|Kale|Kiwi|Lemons|Lettuce|Limes|Mangoes|Mushrooms|Onions|Oranges|Peaches|Pears|Pineapple|Potatoes|Raspberries|Spinach|Strawberries|Sweet potatoes|Tomatoes|Watermelon|Zucchini|Bell peppers|Fresh basil|Fresh parsley|Salad kit|Coleslaw mix",
  deli: "Sliced turkey|Sliced ham|Roast beef|Salami|Pepperoni|Prosciutto|Chicken salad|Tuna salad|Pimento cheese|Prepared sandwiches|Prepared wraps|Hummus|Fresh salsa|Deli cheese|Rotisserie chicken",
  meat: "Chicken breasts|Chicken thighs|Chicken wings|Whole chicken|Ground chicken|Ground turkey|Turkey breast|Bacon|Breakfast sausage|Italian sausage|Pork chops|Pork tenderloin|Ground pork|Ham|Ground beef|Beef roast|Steak|Beef stew meat|Hot dogs|Bratwurst|Salmon|Tilapia|Cod|Tuna steaks|Shrimp|Crab meat|Scallops|Fish sticks|Meatballs|Plant-based burgers",
  dairy: "Whole milk|2% milk|Skim milk|Chocolate milk|Almond milk|Oat milk|Soy milk|Half and half|Heavy cream|Butter|Margarine|Eggs|Egg whites|Sour cream|Cream cheese|Cottage cheese|Greek yogurt|Yogurt cups|Cheddar cheese|Mozzarella cheese|Parmesan cheese|Swiss cheese|American cheese|String cheese|Shredded cheese|Whipped cream|Coffee creamer|Pudding cups",
  bread: "White bread|Wheat bread|Sourdough bread|Rye bread|Hamburger buns|Hot dog buns|Dinner rolls|Bagels|English muffins|Croissants|Pita bread|Naan|Flour tortillas|Corn tortillas|Pizza crust|Biscuits|Muffins|Donuts|Cake|Pie",
  grains: "White rice|Brown rice|Jasmine rice|Basmati rice|Wild rice|Quinoa|Couscous|Barley|Oats|Grits|Spaghetti|Penne pasta|Macaroni|Fettuccine|Lasagna noodles|Egg noodles|Ramen noodles|Rice noodles|Macaroni and cheese|Pancake mix|Waffle mix|Flour|Whole wheat flour|Cornmeal|Bread crumbs|Cereal|Granola|Instant oatmeal|Taco shells",
  canned: "Black beans|Kidney beans|Pinto beans|Chickpeas|Baked beans|Refried beans|Canned corn|Canned green beans|Canned peas|Canned tomatoes|Tomato sauce|Tomato paste|Pasta sauce|Pizza sauce|Canned tuna|Canned chicken|Chicken broth|Beef broth|Vegetable broth|Soup|Peanut butter|Almond butter|Jelly|Honey|Maple syrup|Olive oil|Vegetable oil|Cooking spray|Vinegar|Mayonnaise|Ketchup|Mustard|Barbecue sauce|Hot sauce|Soy sauce|Salad dressing|Pickles|Olives|Applesauce|Canned fruit|Coconut milk|Sugar|Brown sugar|Powdered sugar|Salt|Black pepper|Garlic powder|Onion powder|Paprika|Cinnamon|Vanilla extract|Baking soda|Baking powder|Chocolate chips",
  snacks: "Potato chips|Tortilla chips|Pretzels|Popcorn|Crackers|Cheese crackers|Graham crackers|Cookies|Granola bars|Protein bars|Fruit snacks|Fruit cups|Trail mix|Mixed nuts|Peanuts|Cashews|Almonds|Beef jerky|Rice cakes|Applesauce pouches|Candy|Chocolate|Gum|Snack cakes",
  frozen: "Frozen pizza|Frozen vegetables|Frozen broccoli|Frozen corn|Frozen peas|Frozen fruit|Frozen berries|French fries|Tater tots|Hash browns|Chicken nuggets|Frozen chicken tenders|Frozen meatballs|Frozen fish|Frozen shrimp|Frozen waffles|Frozen pancakes|Frozen dinners|Frozen burritos|Ice cream|Popsicles|Frozen pie|Frozen bread dough",
  beverages: "Bottled water|Sparkling water|Orange juice|Apple juice|Cranberry juice|Lemonade|Iced tea|Tea bags|Coffee|Coffee pods|Hot chocolate|Cola|Diet cola|Lemon-lime soda|Root beer|Ginger ale|Sports drinks|Energy drinks|Coconut water|Drink mix|Beer|Wine",
  household: "Paper towels|Toilet paper|Facial tissues|Napkins|Paper plates|Paper cups|Plastic utensils|Aluminum foil|Plastic wrap|Parchment paper|Food storage bags|Trash bags|Dish soap|Dishwasher detergent|Laundry detergent|Fabric softener|Dryer sheets|All-purpose cleaner|Glass cleaner|Bathroom cleaner|Disinfecting wipes|Sponges|Hand soap|Hand sanitizer|Light bulbs|Batteries|Air freshener|Pet food|Cat litter|Charcoal|Food storage containers|Coffee filters",
  other: "Baby food|Baby formula|Diapers|Baby wipes|Dog treats|Cat treats|Birthday candles|Greeting card|Ice|Propane exchange|Flowers|Firewood",
};

export const GROCERY_CATALOG_SEED = Object.entries(CATALOG_GROUPS).flatMap(([categoryKey, names]) =>
  names.split("|").map(name => ({
    name,
    normalizedName: name.toLocaleLowerCase(),
    categoryKey: categoryKey as GroceryCategoryKey,
    searchTerms: name.toLocaleLowerCase(),
  })),
);

let catalogSeedPromise: Promise<void> | undefined;

export function ensureGroceryCatalogSeeded(): Promise<void> {
  catalogSeedPromise ??= (async () => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(groceryCatalogItemsTable);
    if (count > 0) return;

    for (let index = 0; index < GROCERY_CATALOG_SEED.length; index += 100) {
      await db
        .insert(groceryCatalogItemsTable)
        .values(GROCERY_CATALOG_SEED.slice(index, index + 100))
        .onConflictDoNothing({ target: groceryCatalogItemsTable.normalizedName });
    }
  })().catch(error => {
    catalogSeedPromise = undefined;
    throw error;
  });
  return catalogSeedPromise;
}