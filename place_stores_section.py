import re

with open("artifacts/home-hub-web/src/pages/Settings.tsx", "r") as f:
    content = f.read()

# We need to find:
#       <AccordionSection
#         icon={<Home className="w-4 h-4" />}
#         title="Properties"
# ...
#       </AccordionSection>
# 
# And place it after.
# Wait, let's use a regex to match the end of the Properties AccordionSection.

import re
match = re.search(r'title="Properties".*? Add property\n            </button>\n          \)}\n        </div>\n      </AccordionSection>', content, re.DOTALL)
if match:
    idx = match.end()
    insertion = "\n\n      <StoresSection canEdit={canManageProperties} />"
    new_content = content[:idx] + insertion + content[idx:]
    with open("artifacts/home-hub-web/src/pages/Settings.tsx", "w") as f:
        f.write(new_content)
    print("Placed StoresSection successfully.")
else:
    print("Regex match failed.")
