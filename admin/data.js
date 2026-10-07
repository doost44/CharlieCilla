// Admin Data Management Module
// Stores and retrieves project data from localStorage

const STORAGE_KEY_HOME = "charliecilla_home_projects";
const STORAGE_KEY_ARCHIVES = "charliecilla_archive_projects";
const STORAGE_KEY_PROJECTS = "charliecilla_projects";

// Available images in the repository (for image picker)
// Paths are relative to pages_code folder (for Projects page) or root (for Archives/Home)
const REPOSITORY_IMAGES = [
  { path: "../Mealplan.jpg", name: "Mealplan" },
  { path: "../A4_Charlie_Cilla_ImagePoster.jpg", name: "Image Poster" },
  { path: "../A5_Charlie_Cilla_Paradox.jpg", name: "Paradox" },
  {
    path: "../A7_Charlie_Cilla_finalassignment2.png",
    name: "Final Assignment",
  },
  { path: "../DDE_UOW_Works4.jpg", name: "DDE UOW Works" },
  {
    path: "../Editorial_Illustration_scientificamerican.jpg",
    name: "Editorial Illustration",
  },
  { path: "../Face.jpg", name: "Face" },
  { path: "../Face (2).jpg", name: "Face 2" },
  { path: "../InnisdaleSS_Print.jpg", name: "Innisdale Print" },
  { path: "../NationalGeo_CollageWork.jpg", name: "National Geo Collage" },
  { path: "../POSTER1 (1).jpg", name: "Poster 1" },
  { path: "../POSTER1 (2).jpg", name: "Poster 2" },
  { path: "../POSTER1 (3).jpg", name: "Poster 3" },
  { path: "../POSTER1 (4).jpg", name: "Poster 4" },
  { path: "../POSTER1 (5).jpg", name: "Poster 5" },
  { path: "../Song cover v1.jpg", name: "Song Cover" },
  {
    path: "../[GBDA 202] Rebranding Pitch-1_page-0001.jpg",
    name: "Rebranding Pitch 1",
  },
  {
    path: "../[GBDA 202] Part 3 Rebranding Pitch-12 (1).jpg",
    name: "Rebranding Pitch 12",
  },
  {
    path: "../[GBDA 202] Rebranding Pitch-16_page-0001.jpg",
    name: "Rebranding Pitch 16",
  },
  { path: "../ahftw_UOW_works2.jpg", name: "AHFTW UOW Works" },
  { path: "../huh_UOW_Works1.jpg", name: "Huh UOW Works" },
];

// Dedicated image list for flipbook pages on the Projects page.
// Paths are relative to pages_code/page_projects.html.
const HANDBOOK_FLIPBOOK_IMAGES = Array.from({ length: 22 }, (_, i) => {
  const pageNum = String(i + 1).padStart(2, "0");
  return {
    path: `Handbook_Files/handbook-pages/page-${pageNum}.jpg`,
    name: `Handbook Page ${pageNum}`,
  };
});

const VOICES_FLIPBOOK_IMAGES = Array.from({ length: 36 }, (_, i) => {
  const pageNum = String(i + 1).padStart(2, "0");
  return {
    path: `Handbook_Files/handbook-pages/voices-${pageNum}.jpg`,
    name: `Voices Page ${pageNum}`,
  };
});

const HANDBOOK_2026_FLIPBOOK_IMAGES = Array.from({ length: 28 }, (_, i) => {
  const pageNum = String(i + 1).padStart(2, "0");
  return {
    path: `Handbook_Files/handbook-pages/handbook2026-${pageNum}.jpg`,
    name: `Handbook 2026 Page ${pageNum}`,
  };
});

const REPOSITORY_FLIPBOOK_IMAGES = [
  ...HANDBOOK_FLIPBOOK_IMAGES,
  ...VOICES_FLIPBOOK_IMAGES,
  ...HANDBOOK_2026_FLIPBOOK_IMAGES,
];

// Default home page projects (video/film)
const DEFAULT_HOME_PROJECTS = [
  {
    id: "home-0",
    title: "DESIGNER HANDBOOK",
    year: "2026",
    category: "PRINT / EDITORIAL",
    description:
      "A year further into the role, that range has turned into ownership. I'm still moving across 10+ WUSA sub-brands under strict guidelines and adapting on the fly, but now I'm shaping the system itself &mdash; I helped build out a design cheat sheet so the wider team could stay consistent and onboard faster, nudged WUSA's visual identity toward something more photo-based and a little more relaxed, and led the sub-branding for Welcome Week.<br><br>This year the handbook also went to print for the first time, turning a resource that used to live only on a screen into something designers could actually hold. My event graphics work has sharpened into one of my strongest skills &mdash; layouts that hold up under tight deadlines, and concepts confident enough to push past the obvious.",
    credit: "",
    type: "carousel-images",
    carouselImages: {
      basePath: "Handbook_Files/handbook-pages/handbook2026-",
      pageCount: 28,
      extension: ".jpg",
      spread: true,
    },
    visible: true,
  },
  {
    id: "home-2",
    title: "VOICES 2025",
    year: "2025",
    category: "PUBLICATION",
    description:
      "Voices has been a project of WUSA's Women's Centre since 1995, printing a new anthology magazine of student work each year. Over those years it's become something special &mdash; a space that holds different artistic expressions and experiences, where students can voice their beliefs, share their hearts, and mark both celebration and mourning.<br><br>For the 2025 edition, I stepped in as lead designer, guiding the entire design identity from the ground up. I worked independently through every stage &mdash; developing the concept, pitching it, and carrying the project from idea to finished publication in a short period of time, while making sure the design still did justice to a publication with this much history behind it.",
    credit: "",
    type: "carousel-images",
    carouselImages: {
      basePath: "Handbook_Files/handbook-pages/voices-",
      pageCount: 36,
      extension: ".jpg",
      spread: true,
    },
    visible: true,
  },
  {
    id: "home-10",
    title: "BLOCKCHAIN 2026 MERCH",
    year: "2026",
    category: "WATERLOO BLOCKCHAIN",
    description:
      "Commissioned by Waterloo Blockchain for a potential 2026 merch line. The designs didn't make it to production due to logistical issues on the club's end, but they stand as a continued exploration of apparel and merch design.",
    credit: "",
    type: "carousel-images",
    carouselImages: {
      basePath: "Assets/blockchain-2026-merch/slide-",
      pageCount: 8,
      extension: ".jpg",
    },
    visible: true,
  },
  {
    id: "home-1",
    title: "DESIGNER HANDBOOK 2025",
    year: "2025",
    category: "PRINT / EDITORIAL",
    description:
      "The Designer Handbook is less a single document and more a working record of what it means to design inside WUSA &mdash; a highly structured, brand-heavy environment where consistency matters just as much as creativity.<br><br>At WUSA, I work under strict brand guidelines, producing a high volume of assets on tight turnarounds while keeping a strong, consistent presence across 10+ different sub-brands &mdash; switching between them and adapting fast.<br><br>Outside of day-to-day student services work, I take on event graphics: strong layouts, bold concepts, and more room to actually push ideas creatively.",
    credit: "",
    type: "carousel-images",
    carouselImages: {
      basePath: "Handbook_Files/handbook-pages/page-",
      pageCount: 22,
      extension: ".jpg",
      spread: true,
    },
    visible: true,
  },
  {
    id: "home-5",
    title: "AMNA",
    year: "2025",
    category: "WATERLOO BLOCKCHAIN",
    description: "TECH WEEK 2025",
    credit: "",
    type: "video-file",
    videoSrc: "Assets/videos/amna-tech-week-2025.mp4",
    cover: "Assets/covers/amna-tech-week-2025.jpg",
    visible: true,
  },
  {
    id: "home-6",
    title: "BBINB",
    year: "2025",
    category: "WATERLOO BLOCKCHAIN",
    description: "BLOCKCHAIN IN INDUSTRY 2025",
    credit: "",
    type: "video-file",
    videoSrc: "Assets/videos/bbinb-blockchain-industry-2025.mp4",
    cover: "Assets/covers/bbinb-blockchain-industry-2025.jpg",
    visible: true,
  },
  {
    id: "home-9",
    title: "BLOCKCHAIN AND BEER",
    year: "2025",
    category: "WATERLOO BLOCKCHAIN",
    description:
      "A concept merchandise line pitched for the Waterloo Blockchain club. The line went unused, but it was my first introduction to merchandising and designing apparel concepts.",
    credit: "",
    type: "carousel-images",
    carouselImages: {
      basePath: "Assets/blockchain-beer-merch/slide-",
      pageCount: 10,
      extension: ".jpg",
    },
    visible: true,
  },
  {
    id: "home-8",
    title: "STUDENT MEAL PLAN APP PROTOTYPE",
    year: "2025",
    category: "APP PROTOTYPE",
    description: "A BUDGETING TOOL FOR STUDENT MEAL PLANS",
    credit: "",
    type: "images",
    images: ["../Mealplan.jpg"],
    visible: true,
  },
  {
    id: "home-7",
    title: "WATERLOO BLOCKCHAIN",
    year: "2025",
    category: "10 YEAR ETHEREUM ANNIVERSARY",
    description: "10 YEAR ETHEREUM ANNIVERSARY 2025",
    credit: "",
    type: "video-file",
    videoSrc: "Assets/videos/waterloo-blockchain-eth-anniversary-2025.mp4",
    cover: "Assets/covers/waterloo-blockchain-eth-anniversary-2025.jpg",
    visible: true,
  },
  {
    id: "home-3",
    title: "THE GOATMAN",
    year: "2024",
    category: "SHORT FILM",
    description: "A PAINTED JOURNEY THROUGH A STRANGE WORLD",
    credit: "",
    type: "video",
    youtubeUrl: "https://www.youtube.com/watch?v=_8m2P_TAWSE",
    youtubeId: "_8m2P_TAWSE",
    visible: true,
  },
  {
    id: "home-4",
    title: "BOUND BY BOARDS",
    year: "2024",
    category: "SHORT DOC",
    description: "CONNECTIONS MADE THROUGH GRIPTAPE",
    credit: "DP",
    type: "video",
    youtubeUrl: "https://www.youtube.com/watch?v=84KcwAFeiZg",
    youtubeId: "84KcwAFeiZg",
    visible: true,
  },
];

// Default archive page projects
const DEFAULT_ARCHIVE_PROJECTS = [
  {
    id: "archive-1",
    title: "National Geo Collage Work",
    imagePath: "../NationalGeo_CollageWork.jpg",
    detailPagePath: "../projects_code/project1.html",
    column: "left",
    visible: true,
  },
  {
    id: "archive-2",
    title: "Song Cover",
    imagePath: "../Song cover v1.jpg",
    detailPagePath: "../projects_code/project2.html",
    column: "left",
    visible: true,
  },
  {
    id: "archive-3",
    title: "Paradox",
    imagePath: "../A5_Charlie_Cilla_Paradox.jpg",
    detailPagePath: "../projects_code/project3.html",
    column: "left",
    visible: true,
  },
  {
    id: "archive-4",
    title: "AHFTW UOW Works",
    imagePath: "../ahftw_UOW_works2.jpg",
    detailPagePath: "../projects_code/project4.html",
    column: "middle",
    visible: true,
  },
  {
    id: "archive-5",
    title: "Editorial Illustration",
    imagePath: "../Editorial_Illustration_scientificamerican.jpg",
    detailPagePath: "../projects_code/project5.html",
    column: "middle",
    visible: true,
  },
  {
    id: "archive-6",
    title: "Innisdale Print",
    imagePath: "../InnisdaleSS_Print.jpg",
    detailPagePath: "../projects_code/project6.html",
    column: "middle",
    visible: true,
  },
  {
    id: "archive-7",
    title: "Huh UOW Works",
    imagePath: "../huh_UOW_Works1.jpg",
    detailPagePath: "../projects_code/project7.html",
    column: "right",
    visible: true,
  },
  {
    id: "archive-8",
    title: "DDE UOW Works",
    imagePath: "../DDE_UOW_Works4.jpg",
    detailPagePath: "../projects_code/project8.html",
    column: "right",
    visible: true,
  },
  {
    id: "archive-9",
    title: "Final Assignment",
    imagePath: "../A7_Charlie_Cilla_finalassignment2.png",
    detailPagePath: "../projects_code/project9.html",
    column: "right",
    visible: true,
  },
];

// Default projects page projects
const DEFAULT_PROJECTS = [
  {
    id: "project-1",
    title: "Student Meal Plan App Prototype",
    description: `University students face considerable difficulty when trying to manage their meal plans efficiently.<br> <br>
Meal plans provide convenience but they fail to supply students with essential budgeting tools throughout an academic semester.<br> <br>
Students frequently believe their meal plan money will last through the semester but unexpectedly find their funds depleted before the end.<br> <br>
This leads to financial stress and dependence on expensive or low-nutrition food alternatives.`,
    type: "images",
    images: ["../Mealplan.jpg"],
    displayStyle: "default",
    visible: true,
  },
  {
    id: "project-2",
    title: "POWERADE Rebrand",
    description: `Powerade isn't just a drink—it's fuel for champions. But to lead the sports drink market, it must rediscover its roots. Athletes and sports enthusiasts may be the audience, but inspiration is missing. A brand without a story is a name without a legacy. <br> <br>

Born from the relentless spirit of runners—the athletes of speed and endurance—Powerade was once the pulse of those who lived to push limits. Young, driven, and unyielding, they found solace in a drink that matched their pace. But as Powerade expanded, its essence blurred, leaving behind the runners who first made it great. <br> <br>

The BIG IDEA is a return to origin—a bold resurgence of endurance, momentum, and the unbreakable will to go further. This isn't just about hydration; it's about igniting the fire of movement, the passion of pursuit, the thrill of crossing the finish line. The visual language will be daring, expressive, and explosive—a call to action for all who strive for greatness.`,
    type: "images",
    images: [
      "../[GBDA 202] Rebranding Pitch-1_page-0001.jpg",
      "../[GBDA 202] Part 3 Rebranding Pitch-12 (1).jpg",
      "../[GBDA 202] Rebranding Pitch-16_page-0001.jpg",
    ],
    displayStyle: "default",
    visible: true,
  },
  {
    id: "project-3",
    title: "WYAWYG?",
    description: `Posters that demonstrate my <br> creativity as a desinger and artist. Each <br> poster is a digitization of a peice of art
I <br>created in a physical medium. <br> <br> Each piece displays my ability to mold the <br> digital and physical worlds of design together, <br> creating something new .`,
    type: "images",
    images: [
      "../POSTER1 (1).jpg",
      "../POSTER1 (5).jpg",
      "../POSTER1 (2).jpg",
      "../POSTER1 (3).jpg",
      "../POSTER1 (4).jpg",
    ],
    displayStyle: "grid-5",
    visible: true,
  },
  {
    id: "project-4",
    title: "Designer Handbook",
    description: `A comprehensive visual guide exploring the fundamental principles of design.<br><br>
This handbook serves as both a personal reference and a creative exploration of typography, color theory, composition, and visual hierarchy.<br><br>
Each spread demonstrates practical applications of design principles through carefully crafted layouts and thoughtful use of whitespace.`,
    type: "carousel-images",
    carouselImages: {
      basePath: "Handbook_Files/handbook-pages/page-",
      pageCount: 22,
      extension: ".jpg",
      spread: true,
    },
    displayStyle: "default",
    visible: true,
  },
  {
    id: "project-5",
    title: "Voices 2025",
    description: `An immersive multimedia project capturing diverse perspectives and stories.<br><br>
Voices combines visual storytelling with audio narratives to create a time capsule of contemporary experiences.<br><br>
The project explores themes of identity, community, and aspiration through a series of interviews and artistic interpretations.`,
    type: "carousel-images",
    carouselImages: {
      basePath: "Handbook_Files/handbook-pages/voices-",
      pageCount: 36,
      extension: ".jpg",
      spread: true,
    },
    displayStyle: "default",
    visible: true,
  },
];

// Password hash (SHA-256 of 'charlievito')
const PASSWORD_HASH =
  "8a9bcf5e3c7d4e6f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f";

// Get home projects from localStorage or defaults
function getHomeProjects() {
  const stored = localStorage.getItem(STORAGE_KEY_HOME);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Error parsing home projects:", e);
    }
  }
  return [...DEFAULT_HOME_PROJECTS];
}

// Save home projects to localStorage
function saveHomeProjects(projects) {
  localStorage.setItem(STORAGE_KEY_HOME, JSON.stringify(projects));
}

// Get archive projects from localStorage or defaults
function getArchiveProjects() {
  const stored = localStorage.getItem(STORAGE_KEY_ARCHIVES);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error("Error parsing archive projects:", e);
    }
  }
  return [...DEFAULT_ARCHIVE_PROJECTS];
}

// Save archive projects to localStorage
function saveArchiveProjects(projects) {
  localStorage.setItem(STORAGE_KEY_ARCHIVES, JSON.stringify(projects));
}

// Get projects from localStorage or defaults
function getProjects() {
  const stored = localStorage.getItem(STORAGE_KEY_PROJECTS);
  if (stored) {
    try {
      const projects = JSON.parse(stored);
      // Validate that it's an array
      if (Array.isArray(projects)) {
        return projects;
      } else {
        console.warn("Projects data is not an array, resetting to defaults");
        localStorage.removeItem(STORAGE_KEY_PROJECTS);
      }
    } catch (e) {
      console.error("Error parsing projects, resetting to defaults:", e);
      localStorage.removeItem(STORAGE_KEY_PROJECTS);
    }
  }
  return [...DEFAULT_PROJECTS];
}

// Save projects to localStorage
function saveProjects(projects) {
  localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
}

// Reset to defaults
function resetToDefaults() {
  localStorage.removeItem(STORAGE_KEY_HOME);
  localStorage.removeItem(STORAGE_KEY_ARCHIVES);
  localStorage.removeItem(STORAGE_KEY_PROJECTS);
}

// Generate unique ID
function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Simple hash function for password verification
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Verify password
async function verifyPassword(password) {
  const hash = await hashPassword(password);
  // Pre-computed hash of 'charlievito'
  return (
    hash === "2e64c8da14d005e8212b14b37f6bae28149d48dcc2f25b6998333d096b7d07e9"
  );
}

// Check if admin is logged in
function isAdminLoggedIn() {
  return sessionStorage.getItem("admin_logged_in") === "true";
}

// Set admin login state
function setAdminLoggedIn(state) {
  if (state) {
    sessionStorage.setItem("admin_logged_in", "true");
  } else {
    sessionStorage.removeItem("admin_logged_in");
  }
}

// Export for use in other files
window.AdminData = {
  getHomeProjects,
  saveHomeProjects,
  getArchiveProjects,
  saveArchiveProjects,
  getProjects,
  saveProjects,
  resetToDefaults,
  generateId,
  verifyPassword,
  isAdminLoggedIn,
  setAdminLoggedIn,
  DEFAULT_HOME_PROJECTS,
  DEFAULT_ARCHIVE_PROJECTS,
  DEFAULT_PROJECTS,
  REPOSITORY_IMAGES,
  REPOSITORY_FLIPBOOK_IMAGES,
};
