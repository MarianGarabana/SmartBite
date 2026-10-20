# Nutrition matches to review

138 foods: 125 from Ciqual, 13 from USDA. 31 items below are judgment calls or weaker matches. To change one, edit data/build/nutrition-map.json and rerun data/build/build_nutrition.py.

## Matches

- **beef steak**: ciqual 6160 "Beef, topside, raw" (raw). Cut varies by shop. Topside used as the usual lean fillet; rump (6206) is close, rib steak is far fattier.
- **blueberries**: ciqual 13028 "Blueberry, raw" (raw). Ciqual 'myrtille' covers blueberry and bilberry; cultivated blueberries may be a little sweeter.
- **canned lentils**: ciqual 20510 "Lentil, seasoned, canned, drained" (canned). Ciqual's canned lentils are 'cuisinée' (lightly seasoned); plain jarred lentils are close.
- **canned mackerel**: ciqual 26123 "Mackerel, fillet (grilled or not grilled), canned in brine, drained" (canned). No mackerel in oil record. Mackerel in olive oil, drained, may carry a few g more fat.
- **canned tuna in oil**: ciqual 26180 "Tuna, whole slice, in sunflower oil, canned, drained" (canned). Assumes sunflower oil, the usual cheap pack. Tuna in olive oil is close (Ciqual 26179).
- **chicken broth**: ciqual 25947 "Broth or stock, poultry, dehydrated and reconstituted" (cooked). Ready-to-use carton broth assumed; homemade broth can have more fat.
- **chili flakes**: ciqual 11088 "Cayenne pepper, powder" (dry). No chili flake record; cayenne powder is the same dried pepper.
- **fresh tuna**: ciqual 26064 "Yellowfin tuna, raw" (raw). Fresh tuna species varies (yellowfin, albacore/bonito, bluefin). Bluefin has about 6 g more fat per 100 g.
- **frozen edamame**: usda 168410 "Edamame, frozen, unprepared" (frozen). Shelled beans assumed; edamame in pods weigh more per bean.
- **frozen mixed berries**: usda 168209 "Raspberries, frozen, red, unsweetened" (frozen). No frozen mixed berry record with energy in either source. Mixes heavy in strawberries are about 20 kcal lower per 100 g.
- **frozen stir-fry vegetables**: ciqual 20101 "Mixed vegetables, frozen, raw" (frozen). Plain mix assumed. Seasoned stir-fry packs with oil (Ciqual 20273) have about 5 g fat.
- **grated cheese**: ciqual 12118 "Emmental cheese, grated, from cow's milk" (raw). Grated cheese packs vary (emmental, mozzarella or a mix); emmental used.
- **greek yogurt**: ciqual 19860 "Yogurt, Greek-style, plain" (raw). European Greek-style yogurt is creamy and low in protein (3 g). Strained Greek yogurt (USDA) has about 9 g; check the label.
- **ground beef**: ciqual 6252 "Beef, minced steak, 10% fat, raw" (raw). Fat in minced beef packs ranges 5 to 20%; 10% used. Ciqual has 5% (6250), 15% (6254) and 20% (6256). Check one Spanish label.
- **ground chicken**: usda 171116 "Chicken, ground, raw" (raw). Ground chicken can include skin and thigh; a breast-only mince is leaner (closer to pechuga de pollo).
- **ground turkey**: usda 2514747 "Turkey, ground, 93% lean/ 7% fat, raw" (raw). Fat in ground turkey packs ranges about 2 to 15%; 93% lean used (this record lists 9.6 g fat). Check one Spanish label.
- **kalamata olives**: ciqual 13032 "Olive, black, in brine" (canned). No kalamata record; generic black olive in brine used.
- **light fresh cheese**: ciqual 19663 "Fresh cream cheese, petit-suisse type, plain, 0% fat" (raw). Low confidence: no Burgos record. Light Burgos labels range from 0 to about 5% fat; check one.
- **light mozzarella**: usda 170847 "Cheese, mozzarella, part skim milk" (raw). Low confidence: USDA part skim is a firm, low moisture cheese. Fresh light mozzarella balls are lower in kcal; check a label.
- **microwave rice**: ciqual 9104 "Rice, white, cooked, no added salt" (cooked). Cups may be white or brown rice and may contain a little oil. Brown cooked rice is Ciqual 9103.
- **pork loin**: ciqual 28480 "Pork, eye of shortloin, raw" (raw). Spanish lomo is the lean loin. Ciqual 'échine' (also translated loin) is the fatty neck end and was not used.
- **pumpkin**: ciqual 20044 "Pumpkin, raw" (raw). Spanish calabaza can be pumpkin or butternut; butternut (Ciqual 20138) has about 10 kcal more per 100 g.
- **quark 0%**: ciqual 19663 "Fresh cream cheese, petit-suisse type, plain, 0% fat" (raw). Plain quark 0% (Ciqual 19644) has about 25% less protein; use it if the pack is plain quark.
- **ricotta**: ciqual 12071 "Brousse (uncured cheese from ewes' milk)" (raw). Brousse is ewe's milk; Italian cow's milk ricotta is close in kcal with a little less protein. Spanish requeson maps to cottage cheese instead (aliases.json), which is closer to its labels.
- **roasted red peppers**: ciqual 20275 "Sweet pepper, red, canned, drained" (canned). No roasted pepper record; jarred roasted peppers are canned red peppers. Ones packed in oil have more fat.
- **rolled oats**: usda 173904 "Cereals, oats, regular and quick, not fortified, dry" (dry). USDA used: Ciqual oat flakes (32140) list 10.6 g protein, well under typical labels (13 to 14 g). USDA carbs include about 10 g fiber.
- **skyr**: usda 330137 "Yogurt, Greek, plain, nonfat" (raw). No skyr record in either source. Spanish skyr labels can be lower in kcal and protein than this record; check one label.
- **spring onion**: usda 170005 "Onions, spring or scallions (includes tops and bulb), raw" (raw). USDA used: the Ciqual record (11003) mixes chives and spring onion.
- **textured soy protein**: usda 174275 "Soy flour, defatted" (dry). No dry textured soy record. Textured soy is extruded defatted soy flour, so macros match; Ciqual has only the rehydrated form (20591).
- **tomato sauce**: ciqual 11107 "Tomato sauce, with onions, prepacked" (canned). Closest to Spanish tomate frito; brands vary in oil and sugar.
- **vanilla whey protein**: usda 173180 "Beverages, Protein powder whey based" (dry). No plain whey isolate record in Ciqual. USDA 173180 (78 g protein, 6 g carbs per 100 g) is closer to isolate labels than USDA 173177 'Whey protein powder isolate' (58 g protein, 29 g carbs). Flavour and brand change carbs a little; use Open Food Facts by barcode for an exact label.

## Left out

- **frozen salmon**: No plain frozen salmon record in Ciqual or USDA, and fresh records are never used for frozen food. Use Open Food Facts by barcode, or add a frozen record.
