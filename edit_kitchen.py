import sys

with open("artifacts/home-hub-web/src/pages/Kitchen.tsx", "r") as f:
    content = f.read()

# Replace the block
start_marker = "// Store profiles — ordered by physical store walk path"
end_marker = "type MealForShopping = { dayName: string; mealType: string; meal: string };"

if start_marker in content and end_marker in content:
    idx1 = content.find(start_marker)
    idx2 = content.find(end_marker)
    new_content = content[:idx1] + end_marker + content[idx2 + len(end_marker):]
    with open("artifacts/home-hub-web/src/pages/Kitchen.tsx", "w") as f:
        f.write(new_content)
    print("Done part 1")
else:
    print("Markers not found")

