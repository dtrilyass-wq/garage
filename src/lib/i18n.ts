import type { Lang } from "./model";

export interface Strings {
  title: string;
  select: string;
  add: string;
  measure: string;
  png: string;
  panel: string;
  selection: string;
  selnone: string;
  ptype: string;
  width: string;
  length: string;
  flag: string;
  aptassign: string;
  apts: string;
  naptl: string;
  autoapt: string;
  layers: string;
  lgrid: string;
  ldims: string;
  lsdims: string;
  lflow: string;
  lsafe: string;
  lclear: string;
  lsnap: string;
  lstruct: string;
  presets: string;
  scenAuto: string;
  scenSurvey: string;
  scMax: string;
  scComfort: string;
  scSuv: string;
  scMaxD: string;
  scComfortD: string;
  scSuvD: string;
  scSurveyOpt: string;
  scSurveyOptD: string;
  scSurveySafe: string;
  scSurveySafeD: string;
  scEasy: string;
  scEasyD: string;
  topRoadL: string;
  topRoadHint: string;
  cars: string;
  flagged: string;
  pmrIncl: string;
  regenHint: string;
  pclear: string;
  garage: string;
  gW: string;
  gH: string;
  gExit: string;
  gLaneW: string;
  gReset: string;
  gHint: string;
  capacity: string;
  epng: string;
  ejson: string;
  ijson: string;
  rules: string;
  r1t: string;
  r2t: string;
  r3t: string;
  r1: string;
  r2: string;
  r3: string;
  addstall: string;
  addobs: string;
  small: string;
  std: string;
  suv: string;
  xl: string;
  pmr: string;
  moto: string;
  col: string;
  wallb: string;
  noz: string;
  stall: string;
  coreL: string;
  wingL: string;
  doorL: string;
  ped: string;
  laneL: string;
  exitL: string;
  oneway: string;
  twoway: string;
  wWall: string;
  wOver: string;
  wLane: string;
  wDoor: string;
  wAisle: string;
  confirmClear: string;
  confirmReset: string;
  planTitle: string;
  planSub: (dims: string) => string;
  thN: string;
  thT: string;
  thD: string;
  thX: string;
  thY: string;
  thA: string;
  tblNote: string;
  unass: string;
  shared: string;
  aptShort: string;
  cap: (n: number, f: number, cls: string, sh: number) => string;
  badJson: string;
}

export const T: Record<Lang, Strings> = {
  fr: {
    title: "GARAGE PLANNER",
    select: "Sélection",
    add: "Ajouter",
    measure: "Mesurer",
    png: "Export PNG",
    panel: "PANNEAU",
    selection: "SÉLECTION",
    selnone: "Touchez une place ou un objet sur le plan.",
    ptype: "Gabarit",
    width: "Largeur (m)",
    length: "Longueur (m)",
    flag: "Marquer « manœuvre délicate »",
    aptassign: "Appartements affectés à cette place",
    apts: "APPARTEMENTS",
    naptl: "Nombre d'appartements",
    autoapt: "Répartir auto",
    layers: "AFFICHAGE",
    lgrid: "Grille (1 m)",
    ldims: "Cotes du relevé",
    lsdims: "Cotes des places",
    lflow: "Sens de circulation",
    lsafe: "Sécurité (extincteurs, miroirs, piéton)",
    lclear: "Dégagements ±25 cm",
    lsnap: "Aimanter (5 cm)",
    lstruct: "Modifier la structure (murs, poteaux…)",
    presets: "SCÉNARIOS",
    scenAuto: "Générés pour ce garage",
    scenSurvey: "Tracés relevés (17,60 × 29,75)",
    scMax: "Optimal auto",
    scComfort: "Confort auto",
    scSuv: "Familial / SUV auto",
    scMaxD: "Le plus de places possible dans les règles : allées ≥ 4,60 m devant les places 90° (les plus justes sont marquées « délicates »), compactes dans les recoins.",
    scComfortD: "Manœuvres faciles : allées ≥ 5,50 m, places de 2,60 m, aucune place délicate, 1 place PMR près de l'escalier.",
    scSuvD: "Grands gabarits : places de 2,80 × 5,40 m, allées ≥ 5,50 m, 1 place PMR près de l'escalier.",
    scSurveyOpt: "Optimal — 13 voitures",
    scSurveyOptD: "Tracé étudié sur le relevé : 13 places multi-gabarits, boucle anti-horaire, 2 places délicates.",
    scSurveySafe: "Confort — 11 voitures",
    scSurveySafeD: "Le même tracé sans les 2 places délicates.",
    scEasy: "Accès facile — 11 voitures",
    scEasyD: "Le tracé relevé sans les 2 places du mur nord (1–2) : toute la bande haute reste une voie de circulation — entrée et sortie en ligne droite, demi-tour aisé.",
    topRoadL: "Voie traversante en haut (sans places 1–2)",
    topRoadHint: "La bande haute devient une voie sur toute la largeur, réservée à la circulation : on entre et on sort facilement, aucune place n'y est générée.",
    cars: "voitures",
    flagged: "délicates",
    pmrIncl: "PMR incluse",
    regenHint: "Dimensions modifiées — choisissez un scénario pour régénérer les places.",
    pclear: "Vider les places",
    garage: "GARAGE",
    gW: "Largeur (m)",
    gH: "Profondeur (m)",
    gExit: "Ouverture sortie (m)",
    gLaneW: "Longueur voie de sortie (m)",
    gReset: "Rétablir la structure du relevé",
    gHint: "Murs, poteaux et places gardent leurs coordonnées quand la taille change.",
    capacity: "CAPACITÉ",
    epng: "Plan PNG + tableau de traçage",
    ejson: "Sauvegarder (fichier JSON)",
    ijson: "Importer un fichier JSON",
    rules: "RÈGLES & NOTES",
    r1t: "Gabarits & allées",
    r2t: "Circulation & sécurité",
    r3t: "Hypothèses à vérifier sur site",
    r1: "<b>Compacte</b> 2,20×4,30 · <b>Standard</b> 2,50×5,00 · <b>SUV</b> 2,80×5,40 · <b>XL</b> 3,15×5,95 · <b>PMR</b> 3,50×5,00.<br>Allée sens unique ≥ <b>3,00 m</b> · double sens ≥ <b>5,00 m</b> · face à des places 90° : <b>5,00–5,50 m</b> (une baie plus large compense une allée plus étroite).<br>+30 cm de largeur contre un mur ou un poteau.",
    r2: "Sortie unique par le <b>mur OUEST</b> via la voie haute — <b>toujours libre</b>.<br>Boucle recommandée (anti-horaire) : passage entre poteaux → allée ouest ↓ → allée sud → allée est ↑ → couloir haut ← → voie de sortie.<br>Butées de roues aux places en butée, <b>2 miroirs convexes</b> (sortie + passage), <b>2 extincteurs</b>, marquage piéton, hauteur libre ≥ 2,20 m sous poutres.",
    r3: "• Profondeur totale <b>29,75 m</b> reprise de votre tracé (le croquis notait 25,13 m depuis le mur intérieur).<br>• Ligne des poteaux bas supposée au nu des têtes de places (Y ≈ 23,19 m) — vérifier.<br>• Le local en L (aile 1,52 × 3,15) est fermé ; le décroché 1,60 × 1,68 est ouvert.<br>• Tout se corrige : activez « Modifier la structure » et déplacez murs / poteaux.",
    addstall: "AJOUTER UNE PLACE",
    addobs: "AJOUTER UN OBSTACLE / ZONE",
    small: "Compacte",
    std: "Standard",
    suv: "SUV",
    xl: "XL / Pickup",
    pmr: "PMR",
    moto: "Moto",
    col: "Poteau 51 cm",
    wallb: "Mur / local",
    noz: "Zone interdite",
    stall: "Place",
    coreL: "CAGE ESCALIER",
    wingL: "LOCAL",
    doorL: "P",
    ped: "piétons",
    laneL: "VOIE DE SORTIE — NE PAS STATIONNER",
    exitL: "SORTIE",
    oneway: "SENS UNIQUE",
    twoway: "double sens",
    wWall: "hors murs",
    wOver: "chevauchement",
    wLane: "sur la voie de sortie",
    wDoor: "bloque une porte",
    wAisle: "allée < 5,00 m devant la place",
    confirmClear: "Supprimer toutes les places ?",
    confirmReset: "Rétablir les murs, poteaux et dimensions du relevé ?",
    planTitle: "PLAN DE STATIONNEMENT — GARAGE RÉSIDENTIEL",
    planSub: (dims) => `Niveau garage · ${dims} · sortie ouest`,
    thN: "N°",
    thT: "Gabarit",
    thD: "L × P (m)",
    thX: "X (m)",
    thY: "Y (m)",
    thA: "Appartements",
    tblNote: "X = distance depuis le mur OUEST · Y = depuis le mur NORD (coin haut-gauche de la place)",
    unass: "Sans place",
    shared: "partagée",
    aptShort: "Appt",
    cap: (n, f, cls, sh) =>
      `Places voiture : <b>${n}</b> (${f} manœuvre délicate)\n${cls}\nPlaces partagées : <b>${sh}</b>`,
    badJson: "JSON invalide",
  },
  en: {
    title: "GARAGE PLANNER",
    select: "Select",
    add: "Add",
    measure: "Measure",
    png: "Export PNG",
    panel: "PANEL",
    selection: "SELECTION",
    selnone: "Tap a stall or object on the plan.",
    ptype: "Template",
    width: "Width (m)",
    length: "Length (m)",
    flag: "Mark as “tight manoeuvre”",
    aptassign: "Apartments assigned to this stall",
    apts: "APARTMENTS",
    naptl: "Number of apartments",
    autoapt: "Auto-distribute",
    layers: "DISPLAY",
    lgrid: "Grid (1 m)",
    ldims: "Survey dimensions",
    lsdims: "Stall dimensions",
    lflow: "Traffic flow",
    lsafe: "Safety (extinguishers, mirrors, walkway)",
    lclear: "Clearances ±25 cm",
    lsnap: "Snap (5 cm)",
    lstruct: "Edit structure (walls, columns…)",
    presets: "SCENARIOS",
    scenAuto: "Generated for this garage",
    scenSurvey: "Surveyed layouts (17.60 × 29.75)",
    scMax: "Auto optimum",
    scComfort: "Auto comfort",
    scSuv: "Auto family / SUV",
    scMaxD: "As many stalls as the rules allow: aisles ≥ 4.60 m in front of 90° stalls (the tightest are flagged), compacts in leftover corners.",
    scComfortD: "Easy manoeuvres: aisles ≥ 5.50 m, 2.60 m wide stalls, no flagged stalls, 1 accessible stall near the stair core.",
    scSuvD: "Large vehicles: 2.80 × 5.40 m stalls, aisles ≥ 5.50 m, 1 accessible stall near the stair core.",
    scSurveyOpt: "Optimum — 13 cars",
    scSurveyOptD: "Layout studied on the survey: 13 mixed-size stalls, counter-clockwise loop, 2 tight stalls.",
    scSurveySafe: "Comfort — 11 cars",
    scSurveySafeD: "The same layout without the 2 tight stalls.",
    scEasy: "Easy access — 11 cars",
    scEasyD: "The surveyed layout without the 2 north-wall stalls (1–2): the whole top strip stays a driving lane — straight run in and out, easy turning.",
    topRoadL: "Through-road along the top (no stalls 1–2)",
    topRoadHint: "The top strip becomes a full-width driving lane reserved for circulation: easy entry and exit, no stalls are generated on it.",
    cars: "cars",
    flagged: "tight",
    pmrIncl: "incl. accessible",
    regenHint: "Size changed — pick a scenario to regenerate the stalls.",
    pclear: "Clear all stalls",
    garage: "GARAGE",
    gW: "Width (m)",
    gH: "Depth (m)",
    gExit: "Exit opening (m)",
    gLaneW: "Exit lane length (m)",
    gReset: "Reset structure to survey",
    gHint: "Walls, columns and stalls keep their coordinates when the size changes.",
    capacity: "CAPACITY",
    epng: "PNG plan + marking table",
    ejson: "Save (JSON file)",
    ijson: "Import a JSON file",
    rules: "RULES & NOTES",
    r1t: "Templates & aisles",
    r2t: "Circulation & safety",
    r3t: "Assumptions to verify on site",
    r1: "<b>Compact</b> 2.20×4.30 · <b>Standard</b> 2.50×5.00 · <b>SUV</b> 2.80×5.40 · <b>XL</b> 3.15×5.95 · <b>Accessible</b> 3.50×5.00.<br>One-way aisle ≥ <b>3.00 m</b> · two-way ≥ <b>5.00 m</b> · facing 90° stalls: <b>5.00–5.50 m</b> (a wider bay compensates a narrower aisle).<br>+30 cm width against a wall or column.",
    r2: "Single access through the <b>WEST wall</b> via the top lane — <b>always kept clear</b>.<br>Recommended loop (counter-clockwise): column gap → west aisle ↓ → south aisle → east aisle ↑ → top corridor ← → exit lane.<br>Wheel stops at nose-in stalls, <b>2 convex mirrors</b> (exit + gap), <b>2 extinguishers</b>, pedestrian markings, clear height ≥ 2.20 m under beams.",
    r3: "• Total depth <b>29.75 m</b> taken from your trace (the sketch noted 25.13 m from the interior wall).<br>• Bottom column line assumed flush with stall heads (Y ≈ 23.19 m) — verify.<br>• The L-shaped room (wing 1.52 × 3.15) is enclosed; the 1.60 × 1.68 notch is open floor.<br>• Everything is fixable: enable “Edit structure” and drag walls / columns.",
    addstall: "ADD A STALL",
    addobs: "ADD AN OBSTACLE / ZONE",
    small: "Compact",
    std: "Standard",
    suv: "SUV",
    xl: "XL / Pickup",
    pmr: "Accessible",
    moto: "Motorbike",
    col: "Column 51 cm",
    wallb: "Wall / room",
    noz: "No-parking zone",
    stall: "Stall",
    coreL: "STAIR CORE",
    wingL: "ROOM",
    doorL: "P",
    ped: "pedestrians",
    laneL: "EXIT LANE — NO PARKING",
    exitL: "EXIT",
    oneway: "ONE WAY",
    twoway: "two-way",
    wWall: "outside walls",
    wOver: "overlap",
    wLane: "on the exit lane",
    wDoor: "blocks a door",
    wAisle: "aisle < 5.00 m in front of the stall",
    confirmClear: "Delete all stalls?",
    confirmReset: "Restore surveyed walls, columns and dimensions?",
    planTitle: "PARKING LAYOUT — RESIDENTIAL GARAGE",
    planSub: (dims) => `Garage level · ${dims} · west exit`,
    thN: "No.",
    thT: "Template",
    thD: "W × L (m)",
    thX: "X (m)",
    thY: "Y (m)",
    thA: "Apartments",
    tblNote: "X = distance from WEST wall · Y = from NORTH wall (top-left corner of the stall)",
    unass: "No stall",
    shared: "shared",
    aptShort: "Apt",
    cap: (n, f, cls, sh) => `Car stalls: <b>${n}</b> (${f} tight manoeuvre)\n${cls}\nShared stalls: <b>${sh}</b>`,
    badJson: "Invalid JSON",
  },
};

export function tr(lang: Lang): Strings {
  return T[lang];
}

/** Format meters for display: FR uses a decimal comma. */
export function fmtM(v: number, lang: Lang, digits = 2): string {
  const s = v.toFixed(digits);
  return lang === "fr" ? s.replace(".", ",") : s;
}
