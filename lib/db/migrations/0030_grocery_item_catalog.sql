CREATE TABLE IF NOT EXISTS "grocery_catalog_items" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "category_key" text NOT NULL,
  "search_terms" text NOT NULL,
  CONSTRAINT "grocery_catalog_items_category_key_check"
    CHECK ("category_key" IN ('produce', 'deli', 'meat', 'dairy', 'bread', 'grains', 'canned', 'snacks', 'frozen', 'beverages', 'household', 'other'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "grocery_catalog_items_normalized_name_unique"
  ON "grocery_catalog_items" ("normalized_name");
CREATE INDEX IF NOT EXISTS "grocery_catalog_items_category_name_idx"
  ON "grocery_catalog_items" ("category_key", "name");

WITH catalog(category_key, items) AS (
  VALUES
    ('produce', ARRAY[
      'Apples','Avocados','Bananas','Blackberries','Blueberries','Broccoli','Brussels sprouts','Cabbage','Cantaloupe','Carrots',
      'Cauliflower','Celery','Cherries','Cilantro','Corn','Cucumbers','Garlic','Ginger','Grapefruit','Grapes',
      'Green beans','Green onions','Jalapeños','Kale','Kiwi','Lemons','Lettuce','Limes','Mangoes','Mushrooms',
      'Onions','Oranges','Peaches','Pears','Pineapple','Potatoes','Raspberries','Spinach','Strawberries','Sweet potatoes',
      'Tomatoes','Watermelon','Zucchini','Bell peppers','Fresh basil','Fresh parsley','Salad kit','Coleslaw mix'
    ]::text[]),
    ('deli', ARRAY[
      'Sliced turkey','Sliced ham','Roast beef','Salami','Pepperoni','Prosciutto','Chicken salad','Tuna salad',
      'Pimento cheese','Prepared sandwiches','Prepared wraps','Hummus','Fresh salsa','Deli cheese','Rotisserie chicken'
    ]::text[]),
    ('meat', ARRAY[
      'Chicken breasts','Chicken thighs','Chicken wings','Whole chicken','Ground chicken','Ground turkey','Turkey breast','Bacon',
      'Breakfast sausage','Italian sausage','Pork chops','Pork tenderloin','Ground pork','Ham','Ground beef','Beef roast',
      'Steak','Beef stew meat','Hot dogs','Bratwurst','Salmon','Tilapia','Cod','Tuna steaks','Shrimp','Crab meat',
      'Scallops','Fish sticks','Meatballs','Plant-based burgers'
    ]::text[]),
    ('dairy', ARRAY[
      'Whole milk','2% milk','Skim milk','Chocolate milk','Almond milk','Oat milk','Soy milk','Half and half','Heavy cream',
      'Butter','Margarine','Eggs','Egg whites','Sour cream','Cream cheese','Cottage cheese','Greek yogurt','Yogurt cups',
      'Cheddar cheese','Mozzarella cheese','Parmesan cheese','Swiss cheese','American cheese','String cheese','Shredded cheese',
      'Whipped cream','Coffee creamer','Pudding cups'
    ]::text[]),
    ('bread', ARRAY[
      'White bread','Wheat bread','Sourdough bread','Rye bread','Hamburger buns','Hot dog buns','Dinner rolls','Bagels',
      'English muffins','Croissants','Pita bread','Naan','Flour tortillas','Corn tortillas','Pizza crust','Biscuits',
      'Muffins','Donuts','Cake','Pie'
    ]::text[]),
    ('grains', ARRAY[
      'White rice','Brown rice','Jasmine rice','Basmati rice','Wild rice','Quinoa','Couscous','Barley','Oats','Grits',
      'Spaghetti','Penne pasta','Macaroni','Fettuccine','Lasagna noodles','Egg noodles','Ramen noodles','Rice noodles',
      'Macaroni and cheese','Pancake mix','Waffle mix','Flour','Whole wheat flour','Cornmeal','Bread crumbs','Cereal',
      'Granola','Instant oatmeal','Taco shells'
    ]::text[]),
    ('canned', ARRAY[
      'Black beans','Kidney beans','Pinto beans','Chickpeas','Baked beans','Refried beans','Canned corn','Canned green beans',
      'Canned peas','Canned tomatoes','Tomato sauce','Tomato paste','Pasta sauce','Pizza sauce','Canned tuna','Canned chicken',
      'Chicken broth','Beef broth','Vegetable broth','Soup','Peanut butter','Almond butter','Jelly','Honey','Maple syrup',
      'Olive oil','Vegetable oil','Cooking spray','Vinegar','Mayonnaise','Ketchup','Mustard','Barbecue sauce','Hot sauce',
      'Soy sauce','Salad dressing','Pickles','Olives','Applesauce','Canned fruit','Coconut milk','Sugar','Brown sugar',
      'Powdered sugar','Salt','Black pepper','Garlic powder','Onion powder','Paprika','Cinnamon','Vanilla extract','Baking soda',
      'Baking powder','Chocolate chips'
    ]::text[]),
    ('snacks', ARRAY[
      'Potato chips','Tortilla chips','Pretzels','Popcorn','Crackers','Cheese crackers','Graham crackers','Cookies',
      'Granola bars','Protein bars','Fruit snacks','Fruit cups','Trail mix','Mixed nuts','Peanuts','Cashews','Almonds',
      'Beef jerky','Rice cakes','Applesauce pouches','Candy','Chocolate','Gum','Snack cakes'
    ]::text[]),
    ('frozen', ARRAY[
      'Frozen pizza','Frozen vegetables','Frozen broccoli','Frozen corn','Frozen peas','Frozen fruit','Frozen berries',
      'French fries','Tater tots','Hash browns','Chicken nuggets','Frozen chicken tenders','Frozen meatballs','Frozen fish',
      'Frozen shrimp','Frozen waffles','Frozen pancakes','Frozen dinners','Frozen burritos','Ice cream','Popsicles',
      'Frozen pie','Frozen bread dough'
    ]::text[]),
    ('beverages', ARRAY[
      'Bottled water','Sparkling water','Orange juice','Apple juice','Cranberry juice','Lemonade','Iced tea','Tea bags',
      'Coffee','Coffee pods','Hot chocolate','Cola','Diet cola','Lemon-lime soda','Root beer','Ginger ale','Sports drinks',
      'Energy drinks','Coconut water','Drink mix','Beer','Wine'
    ]::text[]),
    ('household', ARRAY[
      'Paper towels','Toilet paper','Facial tissues','Napkins','Paper plates','Paper cups','Plastic utensils','Aluminum foil',
      'Plastic wrap','Parchment paper','Food storage bags','Trash bags','Dish soap','Dishwasher detergent','Laundry detergent',
      'Fabric softener','Dryer sheets','All-purpose cleaner','Glass cleaner','Bathroom cleaner','Disinfecting wipes','Sponges',
      'Hand soap','Hand sanitizer','Light bulbs','Batteries','Air freshener','Pet food','Cat litter','Charcoal',
      'Food storage containers','Coffee filters'
    ]::text[]),
    ('other', ARRAY[
      'Baby food','Baby formula','Diapers','Baby wipes','Dog treats','Cat treats','Birthday candles','Greeting card',
      'Ice','Propane exchange','Flowers','Firewood'
    ]::text[])
)
INSERT INTO "grocery_catalog_items" ("name", "normalized_name", "category_key", "search_terms")
SELECT item, lower(btrim(item)), category_key, lower(btrim(item))
FROM catalog
CROSS JOIN LATERAL unnest(items) AS item
ON CONFLICT ("normalized_name") DO UPDATE
SET "name" = EXCLUDED."name",
    "category_key" = EXCLUDED."category_key",
    "search_terms" = EXCLUDED."search_terms";