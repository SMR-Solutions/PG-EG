export interface BangaloreLocation {
  slug: string;
  name: string;
  shortName: string;
  category: "locality" | "tech-park" | "college";
  lat: number;
  lng: number;
  radiusKm: number;
  targetKeywords: string[];
  headline: string;
  subheadline: string;
  overviewText: string;
  highlights: string[];
  faqs: { question: string; answer: string }[];
}

export const BANGALORE_LOCATIONS: BangaloreLocation[] = [
  // ─────────────────────────────────────────
  // 1. POPULAR LOCALITIES
  // ─────────────────────────────────────────
  {
    slug: "pg-in-koramangala",
    name: "Koramangala",
    shortName: "Koramangala",
    category: "locality",
    lat: 12.9352,
    lng: 77.6245,
    radiusKm: 4,
    targetKeywords: ["pg in koramangala", "ladies pg in koramangala", "gents pg in koramangala", "single room pg in koramangala", "luxury pg in koramangala bangalore"],
    headline: "Find Top Rated PGs in Koramangala, Bangalore",
    subheadline: "Verified Gents, Ladies & Co-living PGs near Sony World Signal, 5th Block & 7th Block with zero brokerage.",
    overviewText: "Koramangala is Bangalore's most vibrant startup and dining hub. Known for its tree-lined streets, cafe culture, and proximity to major IT corridors, finding a PG here puts you minutes away from premier workplaces, gyms, and nightlife.",
    highlights: ["Close to Sony World Junction & 80 Feet Road", "Fast access to Indiranagar & HSR Layout", "High concentration of food hubs & fitness centers", "Safe residential blocks with high security"],
    faqs: [
      {
        question: "What is the average rent for a PG in Koramangala, Bangalore?",
        answer: "PG rent in Koramangala typically ranges from ₹8,000 to ₹14,000 for twin/triple sharing, and ₹15,000 to ₹25,000 for single occupancy private rooms with 3-times food and amenities.",
      },
      {
        question: "Are ladies PGs safe in Koramangala?",
        answer: "Yes, Koramangala is one of the safest areas in Bangalore. Most listed ladies PGs on PG-EG feature 24/7 CCTV surveillance, biometric access, and live security guards.",
      },
      {
        question: "Is food included in Koramangala PG accommodations?",
        answer: "Most PGs on PG-EG offer 3-time daily meals (North Indian and South Indian cuisines), along with high-speed WiFi, daily housekeeping, and power backup.",
      },
    ],
  },
  {
    slug: "pg-in-hsr-layout",
    name: "HSR Layout",
    shortName: "HSR Layout",
    category: "locality",
    lat: 12.9121,
    lng: 77.6446,
    radiusKm: 4,
    targetKeywords: ["pg in hsr layout", "gents pg in hsr layout", "ladies pg in hsr layout sector 1 to 7", "single room pg hsr", "coliving pg in hsr layout"],
    headline: "Verified PGs & Co-Living Spaces in HSR Layout, Bangalore",
    subheadline: "Explore modern PGs across Sectors 1, 2, 3, 4, 6 & 7 near 27th Main with high-speed WiFi and food.",
    overviewText: "HSR Layout is Bangalore's premier startup district, boasting wide roads, sprawling parks, and peaceful residential sectors. It serves as the gateway to both Electronic City and the Bellandur tech corridor.",
    highlights: ["Sectors 1 to 7 coverage", "Minutes from 27th Main restaurant row", "Direct connectivity to Silk Board and ORR", "Quiet greenery and top-tier co-working spaces"],
    faqs: [
      {
        question: "How much does a PG cost in HSR Layout?",
        answer: "A standard PG bed in HSR Layout starts around ₹7,500 to ₹11,000 per month for double/triple sharing. Premium single rooms go from ₹14,000 to ₹22,000.",
      },
      {
        question: "Which sector in HSR Layout is best for staying in a PG?",
        answer: "Sectors 1, 2, and 7 are popular among techies commuting to Bellandur/ORR, while Sector 3 and Sector 6 are renowned for cafes, quiet surroundings, and proximity to 27th Main.",
      },
    ],
  },
  {
    slug: "pg-in-btm-layout",
    name: "BTM Layout",
    shortName: "BTM Layout",
    category: "locality",
    lat: 12.9166,
    lng: 77.6101,
    radiusKm: 3.5,
    targetKeywords: ["pg in btm layout", "pg in btm 1st stage", "pg in btm 2nd stage", "cheap pg in btm layout bangalore", "ladies pg near btm lake"],
    headline: "Affordable PGs in BTM Layout Stage 1 & 2, Bangalore",
    subheadline: "Budget-friendly, high-comfort accommodations near Udupi Garden, Silk Board, and Tavarekere.",
    overviewText: "BTM Layout is celebrated for affordable living, coaching hubs, and unbeatable connectivity to Koramangala, Bannerghatta Road, and JP Nagar. It is a favored hub for both students and entry-level IT professionals.",
    highlights: ["Pocket-friendly monthly rents", "Steps from Udupi Garden signal and metro stations", "Vibrant street food, libraries, and coaching institutes", "Easy transit to Electronic City via Silk Board"],
    faqs: [
      {
        question: "What is the starting rent for a PG in BTM Layout?",
        answer: "In BTM Layout, budget PGs start as low as ₹5,500 to ₹7,500 per month for triple/quad sharing, and ₹8,000 to ₹13,000 for double sharing with food.",
      },
    ],
  },
  {
    slug: "pg-in-bellandur",
    name: "Bellandur & Outer Ring Road",
    shortName: "Bellandur",
    category: "locality",
    lat: 12.9279,
    lng: 77.6766,
    radiusKm: 4,
    targetKeywords: ["pg in bellandur", "pg near ecospace bellandur", "pg in green glen layout", "ladies pg in bellandur bangalore", "luxury coliving in bellandur"],
    headline: "Premium PGs in Bellandur & Green Glen Layout",
    subheadline: "Walk-to-work PGs for professionals working at RMZ Ecospace, Embassy TechVillage, and Prestige Tech Park.",
    overviewText: "Bellandur sits right at the heart of Bangalore's IT expressway (Outer Ring Road). Living here cuts your commute time down to a short stroll or cycle ride to the city's largest corporate tech campuses.",
    highlights: ["Walk to RMZ Ecospace and TechVillage", "Safe gated communities in Green Glen Layout", "High-speed broadband tailored for WFH hybrid schedules", "Direct access to Sarjapur Road and Marathahalli"],
    faqs: [
      {
        question: "Can I find a walking-distance PG to RMZ Ecospace in Bellandur?",
        answer: "Yes, PG-EG has numerous verified PGs located in Bellandur and Green Glen Layout within 500m to 1.5km of RMZ Ecospace and Embassy TechVillage.",
      },
    ],
  },
  {
    slug: "pg-in-whitefield",
    name: "Whitefield",
    shortName: "Whitefield",
    category: "locality",
    lat: 12.9698,
    lng: 77.7500,
    radiusKm: 5,
    targetKeywords: ["pg in whitefield", "pg near itpb whitefield", "pg near ePIP zone", "ladies pg in whitefield bangalore", "single room pg in whitefield"],
    headline: "Top PGs in Whitefield near ITPB & EPIP Zone",
    subheadline: "Spacious PGs with modern amenities, AC rooms, and metro connectivity across ITPL, Hoodi & Kadugodi.",
    overviewText: "Whitefield is Bangalore's original IT hub, now powered by the Purple Line Metro. Featuring mega tech parks, international malls, and leafy gated enclaves, it offers some of the most spacious PGs in the city.",
    highlights: ["Close to ITPB, Prestige Shantiniketan & EPIP Zone", "Purple Line Metro stations nearby", "Spacious rooms with modern interior fittings", "Supermarkets, Phoenix Marketcity, and hospitals nearby"],
    faqs: [
      {
        question: "Are there metro-connected PGs in Whitefield?",
        answer: "Yes, many PGs listed on PG-EG are located within walking distance or a short auto ride from Kadugodi, Hopefarm, and Pattandur Agrahara metro stations.",
      },
    ],
  },
  {
    slug: "pg-in-marathahalli",
    name: "Marathahalli",
    shortName: "Marathahalli",
    category: "locality",
    lat: 12.9591,
    lng: 77.6974,
    radiusKm: 4,
    targetKeywords: ["pg in marathahalli", "pg near marathahalli bridge", "pg in spice garden marathahalli", "cheap pg in marathahalli", "gents pg in marathahalli"],
    headline: "Affordable & Convenient PGs in Marathahalli",
    subheadline: "Stay in Spice Garden, Anand Nagar, or Munnekolala with fast transit to Bellandur, Whitefield, and ORR.",
    overviewText: "Marathahalli is the ultimate transit junction linking Whitefield, Bellandur, and Central Bangalore. Areas like Spice Garden and Munnekolala are packed with budget-friendly PGs and lively youth communities.",
    highlights: ["Transit hotspot connecting ORR, Whitefield & HAL", "Spice Garden hub with endless dining options", "Budget-friendly rents with high food variety", "Proximity to Prestige Tech Park and Cessna Business Park"],
    faqs: [
      {
        question: "Why is Spice Garden in Marathahalli so popular for PGs?",
        answer: "Spice Garden is directly adjacent to the Outer Ring Road tech corridor. It offers lower rents than Bellandur while keeping commute times to tech parks under 10-15 minutes.",
      },
    ],
  },
  {
    slug: "pg-in-electronic-city",
    name: "Electronic City Phase 1 & 2",
    shortName: "Electronic City",
    category: "locality",
    lat: 12.8452,
    lng: 77.6602,
    radiusKm: 4.5,
    targetKeywords: ["pg in electronic city phase 1", "pg in electronic city phase 2", "pg near infosys electronic city", "ladies pg in electronic city", "coliving electronic city"],
    headline: "Comfortable PGs in Electronic City Phase 1 & 2",
    subheadline: "Walk to Infosys, Wipro, HCL, Tech Mahindra, and TCS with zero traffic hassle.",
    overviewText: "Electronic City is home to India's tech giants. Living in Phase 1 or Phase 2 lets you walk or cycle to your office campus, surrounded by serene campuses and fast elevated highway access to Silk Board.",
    highlights: ["Walk-to-work distance to Infosys & Wipro gates", "Newly opened Yellow Line Metro connectivity", "High-speed dedicated fiber connections", "Quiet, peaceful suburban vibe with green spaces"],
    faqs: [
      {
        question: "Which phase is better for a PG: Electronic City Phase 1 or Phase 2?",
        answer: "Phase 1 is ideal if you work at Infosys, Wipro, or HP, with great restaurants and high-frequency buses. Phase 2 is calmer, close to Tech Mahindra and TCS, and offers slightly more budget-friendly rents.",
      },
    ],
  },
  {
    slug: "pg-in-indiranagar",
    name: "Indiranagar",
    shortName: "Indiranagar",
    category: "locality",
    lat: 12.9784,
    lng: 77.6408,
    radiusKm: 3.5,
    targetKeywords: ["pg in indiranagar", "luxury pg in indiranagar", "ladies pg in indiranagar 100ft road", "gents pg indiranagar bangalore"],
    headline: "Elite PGs & Co-Living in Indiranagar, Bangalore",
    subheadline: "Experience premium urban living near 100ft Road, 12th Main, and CMH Road with easy Purple Line Metro access.",
    overviewText: "Indiranagar is Bangalore's most upscale residential and lifestyle quarter. PGs here provide top-tier amenities, designer interiors, and immediate access to Bangalore's finest cafes, boutiques, and metro stations.",
    highlights: ["Walking distance to Indiranagar Metro Station", "World-class dining and leisure on 100 Feet Road", "Safe, leafy residential cross-roads", "Minutes from Embassy GolfLinks (EGL) & Domlur"],
    faqs: [
      {
        question: "Are luxury single rooms available in Indiranagar PGs?",
        answer: "Yes, PG-EG lists premium private studios and luxury single rooms in Indiranagar equipped with AC, smart TV, attached balconies, and daily housekeeping.",
      },
    ],
  },

  // ─────────────────────────────────────────
  // 2. TECH PARKS / IT HUBS (Office Searches)
  // ─────────────────────────────────────────
  {
    slug: "pg-near-rmz-ecospace",
    name: "RMZ Ecospace, Bellandur",
    shortName: "RMZ Ecospace",
    category: "tech-park",
    lat: 12.9260,
    lng: 77.6830,
    radiusKm: 3,
    targetKeywords: ["pg near rmz ecospace", "pg near ecospace bellandur", "gents pg near rmz ecospace", "ladies pg near rmz ecospace bangalore", "walkable pg from ecospace"],
    headline: "PGs Near RMZ Ecospace & EcoWorld, Bellandur",
    subheadline: "Avoid ORR traffic jams. Stay within 1-2 km of RMZ Ecospace, Intel, and EcoWorld with verified food and WiFi.",
    overviewText: "RMZ Ecospace is one of the busiest tech hubs on Outer Ring Road, hosting global titans like Intel, Shell, and Honeywell. Staying at a nearby PG lets you walk to work and enjoy peaceful evenings in Bellandur.",
    highlights: ["5-15 minute walk to RMZ Ecospace entry gates", "Located in safe residential belts like Green Glen and Devarabisanahalli", "Dedicated power backup and 100+ Mbps WiFi", "Flexible rent terms with zero brokerage"],
    faqs: [
      {
        question: "How far are the PGs from RMZ Ecospace main gate?",
        answer: "Most PGs in this category on PG-EG are located between 400 meters and 1.8 km from RMZ Ecospace and EcoWorld, making walking or bicycling straightforward.",
      },
    ],
  },
  {
    slug: "pg-near-manyata-tech-park",
    name: "Manyata Tech Park, Hebbal",
    shortName: "Manyata Tech Park",
    category: "tech-park",
    lat: 13.0475,
    lng: 77.6208,
    radiusKm: 3.5,
    targetKeywords: ["pg near manyata tech park", "pg near manyata back gate", "ladies pg near manyata tech park", "gents pg in nagavara near manyata", "coliving near manyata tech park"],
    headline: "Verified PGs Near Manyata Tech Park, Nagavara",
    subheadline: "Walk to Philips, IBM, Cognizant, and Target from top PGs in Nagavara, Thanisandra, and HBR Layout.",
    overviewText: "Manyata Tech Park in North Bangalore houses over 100,000 IT professionals. PGs located near Manyata Gate 1, 2, and the Thanisandra back gates provide convenience, hearty meals, and peaceful living.",
    highlights: ["Proximity to Manyata Gate 1, 2, and Back Gates", "Fast access to Nagavara Junction and Ring Road", "Budget-friendly rents compared to South Bangalore", "Airport road connectivity"],
    faqs: [
      {
        question: "Are there PGs near Manyata Tech Park back gate?",
        answer: "Yes, PG-EG features verified PGs around Thanisandra Main Road and Rachenahalli directly adjacent to Manyata's back gates.",
      },
    ],
  },
  {
    slug: "pg-near-bagmane-tech-park",
    name: "Bagmane Tech Park, CV Raman Nagar",
    shortName: "Bagmane Tech Park",
    category: "tech-park",
    lat: 12.9798,
    lng: 77.6575,
    radiusKm: 3,
    targetKeywords: ["pg near bagmane tech park", "pg in cv raman nagar", "pg near bagmane cv raman nagar", "ladies pg near bagmane tech park", "pg near kaggadasapura"],
    headline: "PGs Near Bagmane Tech Park, CV Raman Nagar",
    subheadline: "Stay in CV Raman Nagar, Kaggadasapura, or Binnamangala minutes away from Dell, Boeing, and Google.",
    overviewText: "Bagmane Tech Park is nestled in East Bangalore, adjoining Indiranagar and Kaggadasapura. It is famous for its serene, green campus, and nearby PGs offer a perfect balance of tech access and neighborhood warmth.",
    highlights: ["Under 2 km to Bagmane Tech Park main gate", "Close to Swami Vivekananda Road Metro", "Affordable living in Kaggadasapura & Vignana Nagar", "Short ride to Indiranagar cafes"],
    faqs: [
      {
        question: "Which areas near Bagmane Tech Park have the best PGs?",
        answer: "CV Raman Nagar, Kaggadasapura, and GM Palya offer the highest concentration of affordable, quality PGs within walking distance of Bagmane Tech Park.",
      },
    ],
  },
  {
    slug: "pg-near-prestige-tech-park",
    name: "Prestige Tech Park, Marathahalli",
    shortName: "Prestige Tech Park",
    category: "tech-park",
    lat: 12.9374,
    lng: 77.6946,
    radiusKm: 3,
    targetKeywords: ["pg near prestige tech park", "pg near cessna business park", "pg in kadubeesanahalli", "pg near jpmorgan kadubeesanahalli", "ladies pg near prestige tech park"],
    headline: "Comfortable PGs Near Prestige Tech Park & Cessna Park",
    subheadline: "Walk to JPMorgan, Adobe, Oracle, and Cisco from PGs in Kadubeesanahalli, Panathur, and Marathahalli.",
    overviewText: "Prestige Tech Park and Cessna Business Park are home to global financial and cloud technology powerhouses. PGs in Kadubeesanahalli and along Panathur Road offer instant access to office desks without battling ORR peak traffic.",
    highlights: ["Walk to JPMorgan, Adobe, and Cisco offices", "Located across Kadubeesanahalli and Marathahalli-ORR", "Modern amenities: High-speed WiFi, laundry & meals", "Quick access to Bellandur and Whitefield"],
    faqs: [
      {
        question: "What is the average rent for a PG near Prestige Tech Park?",
        answer: "Double sharing PGs in Kadubeesanahalli start around ₹8,000 to ₹12,000, while single private rooms range between ₹15,000 and ₹22,000 with 3-times daily meals.",
      },
    ],
  },
  {
    slug: "pg-near-itpb-whitefield",
    name: "ITPB (International Tech Park), Whitefield",
    shortName: "ITPB Whitefield",
    category: "tech-park",
    lat: 12.9873,
    lng: 77.7374,
    radiusKm: 3.5,
    targetKeywords: ["pg near itpb whitefield", "pg near international tech park bangalore", "ladies pg near itpl", "gents pg near itpb whitefield", "pg near pattandur agrahara metro"],
    headline: "PGs Near ITPB (ITPL) & Hope Farm, Whitefield",
    subheadline: "Verified accommodations within walking distance of International Tech Park Bangalore and Whitefield Metro.",
    overviewText: "ITPB is the crown jewel of Whitefield's technology district. PGs around ITPL Main Road and Pattandur Agrahara offer modern facilities, lush garden views, and rapid transit via the Purple Line Metro.",
    highlights: ["5-10 minute commute to ITPL campus", "Metro station within walking distance", "AC rooms, high-speed WiFi, and power backup", "Near Ascendas Park Square Mall"],
    faqs: [
      {
        question: "Can I find an AC PG near ITPB Whitefield?",
        answer: "Yes, many PGs listed on PG-EG near ITPB offer AC rooms with attached washrooms, geysers, and dedicated work desks.",
      },
    ],
  },

  // ─────────────────────────────────────────
  // 3. COLLEGES & UNIVERSITIES (College Searches)
  // ─────────────────────────────────────────
  {
    slug: "pg-near-christ-university",
    name: "Christ University (Central Campus), Hosur Road",
    shortName: "Christ University",
    category: "college",
    lat: 12.9344,
    lng: 77.6060,
    radiusKm: 2.5,
    targetKeywords: ["pg near christ university", "pg near christ university hosur road", "ladies pg near christ university bangalore", "girls pg near christ main campus", "student pg near christ college"],
    headline: "Student PGs Near Christ University (Central Campus)",
    subheadline: "Verified, safe PGs for boys and girls within 500m to 1.5km of Christ University, Hosur Road & SG Palya.",
    overviewText: "Christ University's Central Campus in SG Palya is surrounded by a bustling student community. PGs here are curated for student life: disciplined security, hygienic study spaces, reliable WiFi for assignments, and homely meals.",
    highlights: ["Walking distance to Christ University Back Gate & Main Gate", "SG Palya and Bhavani Nagar student neighborhood", "High security: Biometric access & verified wardens", "Affordable student pricing with flexible deposit terms"],
    faqs: [
      {
        question: "How far are the PGs from Christ University Central Campus?",
        answer: "Most student PGs listed on PG-EG are located between 200 meters and 1 km away, allowing students to walk to class in 5 to 10 minutes.",
      },
      {
        question: "Are there girls PGs with strict curfew and biometric entry near Christ?",
        answer: "Yes, PG-EG has verified ladies PGs near SG Palya offering 24/7 CCTV, fingerprint entry, resident wardens, and parental alert features.",
      },
    ],
  },
  {
    slug: "pg-near-pes-university",
    name: "PES University, Banashankari (Ring Road)",
    shortName: "PES University",
    category: "college",
    lat: 12.9354,
    lng: 77.5348,
    radiusKm: 3,
    targetKeywords: ["pg near pes university", "pg near pes university ring road", "boys pg near pesit banashankari", "ladies pg near pes university", "student hostel near pes university"],
    headline: "Top Student PGs Near PES University, Ring Road",
    subheadline: "Safe, student-friendly PGs in Banashankari 3rd Stage, Hosakerehalli, and Girinagar near PES University.",
    overviewText: "PES University is one of Karnataka's top engineering and management schools. Accommodations near the 100 Feet Ring Road campus provide quiet study atmospheres, healthy food, and high-speed internet.",
    highlights: ["Minutes from PES University Ring Road campus", "Quiet study-friendly residential zones", "Student meal plans with veg/non-veg options", "Affordable student deposit terms"],
    faqs: [
      {
        question: "What is the average PG rent for PES University students?",
        answer: "Student PGs near PES University Ring Road generally cost between ₹6,500 and ₹11,000 per month for double and triple sharing including food.",
      },
    ],
  },
  {
    slug: "pg-near-bmsce",
    name: "BMS College of Engineering (BMSCE), Basavanagudi",
    shortName: "BMSCE Basavanagudi",
    category: "college",
    lat: 12.9410,
    lng: 77.5655,
    radiusKm: 2.5,
    targetKeywords: ["pg near bmsce", "pg near bms college of engineering", "pg in basavanagudi", "boys pg near bms college", "girls pg in basavanagudi"],
    headline: "Student PGs Near BMS College of Engineering (BMSCE)",
    subheadline: "Stay in historic Basavanagudi near Bull Temple Road, minutes away from BMSCE campus.",
    overviewText: "BMS College of Engineering in Basavanagudi is set within Bangalore's cultural heritage core. PGs here provide delicious South Indian meals, serene study environments, and walking access to campus.",
    highlights: ["Walking distance to BMSCE campus gates", "Heritage, tree-canopied neighborhood", "Authentic homely South Indian cuisine", "Proximity to Green Line Metro (National College / Lalbagh)"],
    faqs: [
      {
        question: "Are there vegetarian PGs near BMS College of Engineering?",
        answer: "Yes, Basavanagudi has numerous pure vegetarian PGs serving traditional South Indian meals, clean filtered water, and calm study halls.",
      },
    ],
  },
  {
    slug: "pg-near-ms-ramaiah",
    name: "Ramaiah Institute of Technology (MSRIT), Mathikere",
    shortName: "Ramaiah (MSRIT)",
    category: "college",
    lat: 13.0306,
    lng: 77.5649,
    radiusKm: 2.5,
    targetKeywords: ["pg near ramaiah college", "pg near msrit mathikere", "ladies pg near ramaiah hospital", "boys pg in mathikere", "pg near ramaiah university"],
    headline: "Student PGs Near Ramaiah Institute of Technology (MSRIT)",
    subheadline: "Safe boys and girls PGs in Mathikere and New BEL Road within walking distance of Ramaiah campus.",
    overviewText: "Ramaiah Educational Institutions create a vibrant student precinct across Mathikere and New BEL Road. PGs here offer round-the-clock security, laundry services, study tables, and meals.",
    highlights: ["Walking access to MSRIT, Medical & Dental colleges", "Close to New BEL Road student hangouts and bookstores", "Affordable student sharing options", "24/7 security and high-speed WiFi"],
    faqs: [
      {
        question: "Can students find PGs near New BEL Road close to Ramaiah?",
        answer: "Yes, PG-EG has several verified listings along New BEL Road and Mathikere 1st Main, ideal for Ramaiah students.",
      },
    ],
  },
  {
    slug: "pg-near-mount-carmel",
    name: "Mount Carmel College (MCC), Vasanth Nagar",
    shortName: "Mount Carmel (MCC)",
    category: "college",
    lat: 12.9922,
    lng: 77.5905,
    radiusKm: 2.5,
    targetKeywords: ["pg near mount carmel college", "ladies pg near mcc bangalore", "girls pg in vasanth nagar", "safe ladies pg near mount carmel"],
    headline: "Verified Ladies PGs Near Mount Carmel College (MCC)",
    subheadline: "Secure, premium ladies accommodations in Vasanth Nagar and Palace Road with CCTV and warden support.",
    overviewText: "Mount Carmel College in Vasanth Nagar is one of India's premier women's institutions. PGs here emphasize high security, clean nutritional food, biometric entry, and comfortable amenities.",
    highlights: ["Walking distance to MCC campus on Palace Road", "Strict security, female wardens, and biometric access", "Safe residential streets of Vasanth Nagar & High Grounds", "Homely food with hygiene protocols"],
    faqs: [
      {
        question: "Are curfews flexible at ladies PGs near Mount Carmel College?",
        answer: "Most ladies PGs have standard entry times between 8:30 PM and 9:30 PM, with late pass approvals easily coordinated with wardens and parents.",
      },
    ],
  },
];

export function getLocationBySlug(slug: string): BangaloreLocation | undefined {
  return BANGALORE_LOCATIONS.find((loc) => loc.slug === slug);
}

