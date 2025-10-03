// AFI Publication Series Categories based on Air Force structure
export const AFI_CATEGORIES = {
  "00": { code: "00", name: "All Publications", description: "All Publications" },
  "01": { code: "01", name: "Air Force Culture", description: "Air Force Culture" },
  "10": { code: "10", name: "Operations", description: "Operations" },
  "11": { code: "11", name: "Flying Operations", description: "Flying Operations" },
  "13": { code: "13", name: "Nuclear, Space, Missile, Command and Control", description: "Nuclear, Space, Missile, Command and Control" },
  "14": { code: "14", name: "Intelligence", description: "Intelligence" },
  "15": { code: "15", name: "Weather", description: "Weather" },
  "16": { code: "16", name: "Operations Support", description: "Operations Support" },
  "17": { code: "17", name: "Cyberspace", description: "Cyberspace" },
  "20": { code: "20", name: "Logistics", description: "Logistics" },
  "21": { code: "21", name: "Maintenance", description: "Maintenance" },
  "23": { code: "23", name: "Materiel Management", description: "Materiel Management" },
  "24": { code: "24", name: "Transportation", description: "Transportation" },
  "25": { code: "25", name: "Logistics Staff", description: "Logistics Staff" },
  "31": { code: "31", name: "Security", description: "Security" },
  "32": { code: "32", name: "Civil Engineering", description: "Civil Engineering" },
  "33": { code: "33", name: "Communications and Information", description: "Communications and Information" },
  "34": { code: "34", name: "Services", description: "Services" },
  "35": { code: "35", name: "Public Affairs", description: "Public Affairs" },
  "36": { code: "36", name: "Personnel", description: "Personnel" },
  "38": { code: "38", name: "Manpower And Organization", description: "Manpower And Organization" },
  "40": { code: "40", name: "Medical Command", description: "Medical Command" },
  "41": { code: "41", name: "Health Services", description: "Health Services" },
  "44": { code: "44", name: "Medical", description: "Medical" },
  "46": { code: "46", name: "Nursing", description: "Nursing" },
  "47": { code: "47", name: "Dental", description: "Dental" },
  "48": { code: "48", name: "Aerospace Medicine", description: "Aerospace Medicine" },
  "51": { code: "51", name: "Law", description: "Law" },
  "52": { code: "52", name: "Chaplain", description: "Chaplain" },
  "60": { code: "60", name: "Standardization", description: "Standardization" },
  "61": { code: "61", name: "Scientific/Research And Development", description: "Scientific/Research And Development" },
  "62": { code: "62", name: "Developmental Engineering", description: "Developmental Engineering" },
  "63": { code: "63", name: "Acquisition", description: "Acquisition" },
  "64": { code: "64", name: "Contracting", description: "Contracting" },
  "65": { code: "65", name: "Financial Management", description: "Financial Management" },
  "71": { code: "71", name: "Special Investigations", description: "Special Investigations" },
  "84": { code: "84", name: "History", description: "History" },
  "90": { code: "90", name: "Special Management", description: "Special Management" },
  "91": { code: "91", name: "Safety", description: "Safety" },
  "99": { code: "99", name: "Test And Evaluation", description: "Test And Evaluation" },
};

export const SPECIAL_PUBLICATIONS = {
  "AFH1": { code: "AFH1", name: "Air Force Handbook 1", description: "Air Force Handbook 1" },
  "AFJQS": { code: "AFJQS", name: "Air Force Job Qualification Standard", description: "Air Force Job Qualification Standard" },
  "AFQTP": { code: "AFQTP", name: "Air Force Qualification Training Package", description: "Air Force Qualification Training Package" },
  "CFETP": { code: "CFETP", name: "Career Field Education and Training Plan", description: "Career Field Education and Training Plan" },
  "HOI": { code: "HOI", name: "HAF Operating Instruction", description: "HAF Operating Instruction" },
  "MD": { code: "MD", name: "Mission Directive", description: "Mission Directive" },
  "TT": { code: "TT", name: "Tactics, Techniques, and Procedures", description: "Tactics, Techniques, and Procedures" },
  "TO": { code: "TO", name: "Technical Order", description: "Technical Order" },
  "MISC": { code: "MISC", name: "Miscellaneous", description: "Miscellaneous" },
};

/**
 * Extract the AFI series code from an AFI number
 * Examples:
 *   "AFI 21-101" -> "21"
 *   "DAFI 36-2903" -> "36"
 *   "AFI21-101_319RWSUP" -> "21"
 *   "AFH1-1" -> "AFH1"
 */
export function extractAfiSeriesCode(afiNumber: string): string {
  if (!afiNumber) return "MISC";

  // Remove whitespace and convert to uppercase
  const normalized = afiNumber.trim().toUpperCase();

  // Check for special publications first
  for (const code of Object.keys(SPECIAL_PUBLICATIONS)) {
    if (normalized.startsWith(code)) {
      return code;
    }
  }

  // Extract numeric series code (e.g., "21" from "AFI 21-101" or "AFI21-101")
  const match = normalized.match(/(?:AFI|DAFI|AFMAN|DAFMAN)\s*(\d{2})/);
  if (match && match[1]) {
    return match[1];
  }

  // Default to miscellaneous if no match
  return "MISC";
}

/**
 * Get category information for an AFI number
 */
export function getCategoryForAfi(afiNumber: string): { code: string; name: string; description: string } {
  const seriesCode = extractAfiSeriesCode(afiNumber);
  
  // Check standard categories
  if (seriesCode in AFI_CATEGORIES) {
    return AFI_CATEGORIES[seriesCode as keyof typeof AFI_CATEGORIES];
  }
  
  // Check special publications
  if (seriesCode in SPECIAL_PUBLICATIONS) {
    return SPECIAL_PUBLICATIONS[seriesCode as keyof typeof SPECIAL_PUBLICATIONS];
  }
  
  // Default to miscellaneous
  return SPECIAL_PUBLICATIONS.MISC;
}

/**
 * Get all categories sorted by code
 */
export function getAllCategories() {
  const standard = Object.values(AFI_CATEGORIES);
  const special = Object.values(SPECIAL_PUBLICATIONS);
  return [...standard, ...special];
}

/**
 * Group documents by category
 */
export function groupDocumentsByCategory<T extends { afiNumber: string }>(documents: T[]) {
  const groups: Record<string, { category: ReturnType<typeof getCategoryForAfi>; documents: T[] }> = {};
  
  documents.forEach(doc => {
    const category = getCategoryForAfi(doc.afiNumber);
    if (!groups[category.code]) {
      groups[category.code] = { category, documents: [] };
    }
    groups[category.code].documents.push(doc);
  });
  
  return groups;
}
