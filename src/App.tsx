import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * GCSE Product Design Revision App
 * Pages (page state):
 *   landing | topics | comingSoon | video | info | mcq | short | long | progress | profile
 */

const LS_KEY = 'gcse_pd_revision_progress_v3';
const MARK_ENDPOINT = 'https://gcse-ai-marker.onrender.com/mark';

// New endpoint for AI flashcards (you'll add a route on the same backend)
const FLASHCARDS_ENDPOINT = 'https://gcse-ai-marker.onrender.com/flashcard';

// Fallback cards if the AI endpoint is down / not implemented yet
const FALLBACK_FLASHCARDS = {
  Plastics: [
    {
      front: 'Define a thermoplastic.',
      back: 'A plastic that softens when heated and can be reshaped/remoulded.',
    },
    {
      front: 'Give one example of a thermosetting plastic.',
      back: 'Melamine formaldehyde, epoxy resin, phenol formaldehyde (Bakelite), or urea formaldehyde.',
    },
    {
      front: 'Why are thermosets hard to recycle?',
      back: 'They have cross-links formed during curing, so they cannot be melted and remoulded.',
    },
    {
      front: 'State one property and one use of ABS.',
      back: 'Property: tough and impact resistant. Use: protective casings (e.g. remote controls, toys, phone cases).',
    },
  ],
  default: [
    {
      front: 'What is market pull?',
      back: 'When consumer demand leads to the development of a new product.',
    },
    {
      front: 'What is technology push?',
      back: 'When new technology allows new products to be developed, even if customers didn’t ask for them yet.',
    },
    {
      front: 'Name the 4Ps of marketing.',
      back: 'Product, Price, Place, Promotion.',
    },
  ],
};

// Simple theme tokens
const TEXT_PRIMARY = '#f8fafc';
const TEXT_SECONDARY = '#cbd5e1';
const TEXT_MUTED = '#94a3b8';

// pages where we count "time spent"
const TIME_PAGES = ['video', 'info', 'mcq', 'short', 'long'];

// ------------- helpers -------------

function nowISO() {
  return new Date().toISOString();
}

function timeGreeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  if (h >= 18 && h < 23) return 'Good evening';
  return 'Good night';
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeDefaultStore() {
  return {
    students: [{ id: 'student_1', name: 'Student 1' }],
    activeStudentId: 'student_1',
    progress: {}, // progress[studentId][topicId] = {...}
    time: {}, // time[studentId] = total seconds
    prefs: {}, // prefs[studentId] = { reminderTime, push, haptic }
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return safeDefaultStore();
    const parsed = JSON.parse(raw);
    const base = safeDefaultStore();

    return {
      ...base,
      ...parsed,
      students:
        Array.isArray(parsed.students) && parsed.students.length
          ? parsed.students
          : base.students,
      activeStudentId: parsed.activeStudentId || base.activeStudentId,
      progress: parsed.progress || {},
      time: parsed.time || {},
      prefs: parsed.prefs || {},
    };
  } catch {
    return safeDefaultStore();
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------- topics + progress maths -------------

const TOPIC_CATALOG = [
  {
    id: 'Plastics',
    label: 'Plastics',
    unit: 'Unit 1',
    module: 'Materials & Properties',
    subtitle: 'Thermoplastics, thermosets, finishes',
  },
  {
    id: 'Woods',
    label: 'Woods',
    unit: 'Unit 1',
    module: 'Materials & Properties',
    subtitle: 'Hardwoods, softwoods, manufactured boards',
  },
  {
    id: 'Metals',
    label: 'Metals',
    unit: 'Unit 1',
    module: 'Materials & Properties',
    subtitle: 'Ferrous, non-ferrous, alloys',
  },
  {
    id: 'Composites',
    label: 'Composites & Smart',
    unit: 'Unit 1',
    module: 'Materials & Properties',
    subtitle: 'Composites, modern + smart materials',
  },

  {
    id: 'WoodProcesses',
    label: 'Wood Processes',
    unit: 'Unit 1',
    module: 'Industrial Processes',
    subtitle: 'Joints, machining, workshop processes',
  },
  {
    id: 'PlasticProcesses',
    label: 'Plastic Processes',
    unit: 'Unit 1',
    module: 'Industrial Processes',
    subtitle: 'Injection moulding, vacuum forming',
  },
  {
    id: 'MetalProcesses',
    label: 'Metal Processes',
    unit: 'Unit 1',
    module: 'Industrial Processes',
    subtitle: 'Casting, forming, machining',
  },

  {
    id: 'CADCAM',
    label: 'CAD/CAM & Digital',
    unit: 'Unit 2',
    module: 'CAD/CAM & Digital',
    subtitle: '2D/3D CAD, CNC, CAM',
  },

  {
    id: 'Sustainability',
    label: 'Sustainability',
    unit: 'Unit 1',
    module: 'Sustainability',
    subtitle: 'Environment, ethics, lifecycle',
  },
  {
    id: 'Marketing',
    label: 'Product Lifecycle & 4Ps',
    unit: 'Unit 1',
    module: 'Sustainability',
    subtitle: 'Lifecycle, marketing mix',
  },
  {
    id: 'Legislation',
    label: 'Legislation & Regulations',
    unit: 'Unit 1',
    module: 'Sustainability',
    subtitle: 'Safety, standards, compliance',
  },
  {
    id: 'Designers',
    label: 'Designers & Classics',
    unit: 'Unit 1',
    module: 'Sustainability',
    subtitle: 'Key designers + iconic products',
  },
  {
    id: 'MarketPullPush',
    label: 'Market Pull & Tech Push',
    unit: 'Unit 1',
    module: 'Sustainability',
    subtitle: 'Innovation drivers',
  },
];

function topicPercent(progressForTopic) {
  const g = progressForTopic?.gates;
  if (!g) return 0;
  const steps = [g.videoDone, g.infoDone, g.mcqDone, g.shortDone, g.longDone];
  const done = steps.filter(Boolean).length;
  return Math.round((done / steps.length) * 100);
}

function overallPercent(progressForStudent) {
  const percents = TOPIC_CATALOG.map((t) =>
    topicPercent(progressForStudent?.[t.id])
  );
  const sum = percents.reduce((a, b) => a + b, 0);
  return percents.length ? Math.round(sum / percents.length) : 0;
}

function averageMcqAcrossTopics(studentProgress) {
  const scores = TOPIC_CATALOG.map((t) => {
    const p = studentProgress?.[t.id];
    if (!p?.mcq?.attempts) return null;
    return Math.round((p.mcq.correct / p.mcq.attempts) * 100);
  }).filter((x) => x !== null);

  if (!scores.length) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function developmentTargets(studentProgress) {
  const rows = TOPIC_CATALOG.map((t) => {
    const p = studentProgress?.[t.id];
    const pct = topicPercent(p);
    const g = p?.gates || {};
    const nextGate = !g.videoDone
      ? 'Watch the video'
      : !g.infoDone
      ? 'Read the notes'
      : !g.mcqDone
      ? 'Complete the MCQ quiz (all 25, 70%+)'
      : !g.shortDone
      ? 'Do the short answer questions'
      : !g.longDone
      ? 'Attempt a long answer (60%+)'
      : 'Complete';

    const reason = !g.videoDone
      ? 'You haven’t completed the video gate yet, so the rest stays locked.'
      : !g.infoDone
      ? 'You’ve watched the video. Next you need to complete the notes gate to unlock quizzes.'
      : !g.mcqDone
      ? 'You need to attempt all MCQs and score 70%+ to unlock short answers.'
      : !g.shortDone
      ? 'Short answers need 60%+ on 2 different questions to unlock long answers.'
      : !g.longDone
      ? 'You need 60%+ on a long answer to complete the topic.'
      : 'This topic is complete.';

    return {
      topicId: t.id,
      topicLabel: t.label,
      percent: pct,
      nextStep: nextGate,
      reason,
    };
  });

  return rows
    .filter((r) => r.percent < 100)
    .sort((a, b) => a.percent - b.percent);
}

function moduleBreakdown(studentProgress) {
  const modules = {};
  for (const t of TOPIC_CATALOG) {
    modules[t.module] = modules[t.module] || [];
    modules[t.module].push(t);
  }

  return Object.entries(modules).map(([name, topics]) => {
    const percents = topics.map((t) => topicPercent(studentProgress?.[t.id]));
    const percent = percents.length
      ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
      : 0;

    const subtitle = name.includes('Materials')
      ? 'Polymers, Metals, Composites…'
      : name.includes('Industrial')
      ? 'Forming, casting, moulding'
      : name.includes('CAD')
      ? '2D/3D design, CNC, rendering'
      : 'Environment, legislation, ethics';

    const gradient = name.includes('Materials')
      ? 'linear-gradient(to right, #2563eb, #22c1c3)'
      : name.includes('Industrial')
      ? 'linear-gradient(to right, #f97316, #fb7185)'
      : name.includes('CAD')
      ? 'linear-gradient(to right, #a78bfa, #60a5fa)'
      : 'linear-gradient(to right, #34d399, #22c55e)';

    return { name, percent, subtitle, gradient };
  });
}

// ------------- PLASTICS content (same as before, trimmed explanation only) -------------

const PLASTICS_LEARN = {
  topic: 'Plastics',
  video: {
    title: '6. Plastics',
    embedSrc: 'https://www.youtube.com/embed/PK159UqTsLU?si=JIlbfOunwccbc5tm',
    watchUrl: 'https://youtu.be/PK159UqTsLU',
  },
  infoSections: [
    {
      heading: 'The core difference',
      bullets: [
        'Thermoforming plastics (thermoplastics) soften when heated and can be reshaped.',
        'Thermosetting plastics cure (set) to form permanent bonds, so they cannot be reshaped by reheating.',
        'Thermosets have lots of strong cross-links once cured, which locks the shape in.',
      ],
    },
    {
      heading: 'Thermoforming plastics (thermoplastics)',
      bullets: [
        'Can be reheated and reshaped (often easier to recycle/reprocess).',
        'Often used for packaging and mass-produced items because they can be moulded quickly.',
        'Examples: Acrylic (Perspex), Polystyrene, PVC, ABS, PET, HDPE.',
      ],
    },
    {
      heading: 'Thermosetting plastics',
      bullets: [
        'Once cured, they keep their shape even if reheated.',
        'Good for heat resistance, rigidity and electrical insulation.',
        'Examples: Epoxy resin, Melamine formaldehyde, Phenol formaldehyde (Bakelite), Urea formaldehyde.',
      ],
    },
    {
      heading: 'Examples + typical uses',
      bullets: [
        'Melamine formaldehyde: heat resistant + electrical insulator → plug sockets, laminates, tableware.',
        'Epoxy resin: resin + hardener → strong adhesive/coating/casting.',
        'Acrylic (Perspex): hard, transparent/coloured → signs, displays, guards.',
        'ABS: tough + impact resistant → casings, toys, automotive parts.',
        'PET: clear + tough → bottles/food trays.',
        'HDPE: strong + stiff + chemical resistant → crates, buckets, pipes.',
      ],
    },
    {
      heading: 'Polymer finishes',
      bullets: [
        'Polishing: smooth glossy finish (e.g., acrylic edges).',
        'Texturing: improves grip + appearance.',
        'Spray painting: colour + UV protection (needs prep/primer).',
        'Rubberising spray: improves grip/comfort.',
        'Flocking: fibres make a soft velvet feel.',
        'Laser etching: engraved pattern/texture into the surface.',
      ],
    },
  ],
  keywords: [
    'Polymer',
    'Thermoplastic',
    'Thermoset',
    'Thermoforming',
    'Curing',
    'Cross-links',
    'ABS',
    'Acrylic',
    'PET',
    'HDPE',
    'Melamine formaldehyde',
    'Epoxy resin',
    'Flocking',
    'Laser etching',
  ],
};

// 25 MCQs, short + long questions (same as before, omitted here for brevity of comment)
const PLASTICS_MCQ = [
  {
    id: 'P-MCQ-01',
    difficulty: 1,
    question:
      'Which statement best describes a thermoplastic (thermoforming plastic)?',
    options: [
      'It sets permanently and cannot be reshaped',
      'It softens when heated and can be reshaped',
      'It is always an electrical conductor',
      'It is only used for plug sockets',
    ],
    correctIndex: 1,
    explanation:
      'Thermoplastics soften when heated, so they can be reshaped (often supports recycling).',
  },
  {
    id: 'P-MCQ-02',
    difficulty: 1,
    question: 'Which statement best describes a thermosetting plastic?',
    options: [
      'It can be melted and remoulded repeatedly',
      'It cures to form permanent bonds and cannot be reshaped by reheating',
      'It is always transparent',
      'It is the same as a metal alloy',
    ],
    correctIndex: 1,
    explanation:
      'Thermosets form a cross-linked structure when cured, so reheating does not reshape them.',
  },
  {
    id: 'P-MCQ-03',
    difficulty: 1,
    question: 'Which is a thermosetting plastic?',
    options: ['ABS', 'PET', 'Melamine formaldehyde', 'HDPE'],
    correctIndex: 2,
    explanation:
      'Melamine formaldehyde is a thermoset often used in electrical fittings and laminates.',
  },
  {
    id: 'P-MCQ-04',
    difficulty: 1,
    question: 'Which is a common use of PET?',
    options: [
      'Plug socket casings',
      'Drink bottles and food trays',
      'Saucepans',
      'Electrical wiring cores',
    ],
    correctIndex: 1,
    explanation:
      'PET is commonly used for bottles and trays because it is tough and can be clear.',
  },
  {
    id: 'P-MCQ-05',
    difficulty: 2,
    question: 'Why are cross-links important in thermosetting plastics?',
    options: [
      'They allow the plastic to soften more easily',
      'They lock the polymer chains together to make the shape permanent',
      'They make the plastic absorb water faster',
      'They reduce the plastic to a powder when heated',
    ],
    correctIndex: 1,
    explanation:
      'Cross-links form a rigid network so the thermoset keeps its shape when heated.',
  },
  {
    id: 'P-MCQ-06',
    difficulty: 2,
    question: "Which material is best matched to 'tough and impact resistant'?",
    options: [
      'ABS',
      'Acrylic (Perspex)',
      'Melamine formaldehyde',
      'Epoxy resin',
    ],
    correctIndex: 0,
    explanation:
      'ABS is known for toughness and impact resistance, ideal for casings and toys.',
  },
  {
    id: 'P-MCQ-07',
    difficulty: 2,
    question: 'Acrylic (Perspex) is commonly chosen because it is often…',
    options: [
      'A very good electrical conductor',
      'Transparent or coloured and hard',
      'A thermoset that cannot be machined',
      'A type of hardwood',
    ],
    correctIndex: 1,
    explanation:
      'Acrylic can be clear or coloured and gives a crisp, hard finish (e.g., signage).',
  },
  {
    id: 'P-MCQ-08',
    difficulty: 2,
    question: 'Which finish would you use to create a soft ‘velvet’ feel?',
    options: ['Polishing', 'Flocking', 'Anodising', 'Seasoning'],
    correctIndex: 1,
    explanation:
      'Flocking adds fibres to create a soft-touch, velvet-like surface.',
  },
  {
    id: 'P-MCQ-09',
    difficulty: 2,
    question:
      'Why might a designer choose rubberising spray on a polymer handle?',
    options: [
      'To increase electrical conductivity',
      'To add grip and comfort',
      'To make it transparent',
      'To permanently cross-link the polymer',
    ],
    correctIndex: 1,
    explanation:
      'Rubberised coatings improve grip and comfort; they don’t change polymer type.',
  },
  {
    id: 'P-MCQ-10',
    difficulty: 3,
    question:
      'A product must resist heat and act as an electrical insulator. Which is most suitable?',
    options: ['PET', 'HDPE', 'Melamine formaldehyde', 'ABS (unfilled)'],
    correctIndex: 2,
    explanation:
      'Melamine formaldehyde is a thermoset used due to heat resistance and insulation.',
  },
  {
    id: 'P-MCQ-11',
    difficulty: 3,
    question: 'Which combination is most accurate?',
    options: [
      'Thermoplastic + cross-links + cannot be reshaped',
      'Thermoset + cures + cannot be reshaped',
      'Thermoset + melts repeatedly + easy recycling',
      'Thermoplastic + cannot be heated + brittle always',
    ],
    correctIndex: 1,
    explanation:
      'Thermosets cure to a cross-linked structure so they cannot be reshaped by reheating.',
  },
  {
    id: 'P-MCQ-12',
    difficulty: 3,
    question:
      'A manufacturer wants to reduce waste by re-melting offcuts. Which polymer type helps most?',
    options: [
      'Thermosetting',
      'Thermoforming (thermoplastic)',
      'Ceramic',
      'Composite',
    ],
    correctIndex: 1,
    explanation:
      'Thermoplastics can be reheated and reprocessed, which supports recycling.',
  },
  {
    id: 'P-MCQ-13',
    difficulty: 3,
    question: 'Which is the best reason HDPE is used for crates and buckets?',
    options: [
      'It is cross-linked so it never deforms',
      'It is strong, stiff and has good chemical resistance',
      'It is transparent and easy to polish',
      'It is a thermoset and very brittle',
    ],
    correctIndex: 1,
    explanation:
      'HDPE is tough, stiff and chemically resistant—good for containers and crates.',
  },
  {
    id: 'P-MCQ-14',
    difficulty: 3,
    question: 'Laser etching on plastics is best described as…',
    options: [
      'Adding fibres for a velvet surface',
      'Engraving a pattern/texture into the surface with a laser',
      'Melting the entire product back into pellets',
      'A paint layer applied with an aerosol',
    ],
    correctIndex: 1,
    explanation:
      'Laser etching uses a laser to engrave or mark the polymer surface.',
  },
  {
    id: 'P-MCQ-15',
    difficulty: 4,
    question: 'Which option shows a correct property → use link?',
    options: [
      'PET: electrical conductor → plug pins',
      'Epoxy resin: used with hardener → strong adhesive/coating',
      'Acrylic: flexible rubbery feel → grips',
      'HDPE: transparent glass-like finish → lenses',
    ],
    correctIndex: 1,
    explanation:
      'Epoxy resin is commonly used as a strong adhesive or protective coating when cured.',
  },
  {
    id: 'P-MCQ-16',
    difficulty: 4,
    question:
      'Acrylic can be a poor choice for a sports helmet visor mainly because…',
    options: [
      'It always conducts electricity',
      'It can be brittle and crack/shatter under impact',
      'It cannot be coloured',
      'It cannot be machined or formed',
    ],
    correctIndex: 1,
    explanation:
      'Acrylic is hard and clear, but it can crack under impact compared with tougher polymers.',
  },
  {
    id: 'P-MCQ-17',
    difficulty: 4,
    question: 'Why is melamine formaldehyde suitable for plug socket casings?',
    options: [
      'It can be reheated and reshaped during use',
      'It has strong cross-links and resists heat and electricity',
      'It is transparent and easy to polish',
      'It is lightweight and flexible under stress',
    ],
    correctIndex: 1,
    explanation:
      'Melamine is a thermoset: heat resistant and electrically insulating.',
  },
  {
    id: 'P-MCQ-18',
    difficulty: 4,
    question:
      'A company wants a glossy, high-quality look on acrylic edges after cutting. Best finish?',
    options: ['Flocking', 'Polishing', 'Texturing', 'Rubberising spray'],
    correctIndex: 1,
    explanation: 'Polishing acrylic edges gives a clear, glossy finish.',
  },
  {
    id: 'P-MCQ-19',
    difficulty: 4,
    question:
      "Which is the strongest explanation for 'thermosets are harder to recycle'?",
    options: [
      'They melt too easily',
      'They cannot be reheated to reshape because cross-links lock the structure',
      'They always float in water so sorting is impossible',
      'They are only used in small products',
    ],
    correctIndex: 1,
    explanation:
      'Cross-links prevent remelting and remoulding, so recycling is more difficult.',
  },
  {
    id: 'P-MCQ-20',
    difficulty: 5,
    question:
      'A kettle base needs heat resistance and electrical insulation. Best material choice?',
    options: ['ABS', 'Melamine formaldehyde', 'PET', 'Acrylic (Perspex)'],
    correctIndex: 1,
    explanation:
      'Melamine formaldehyde is a thermoset used in many heat/electrical applications.',
  },
  {
    id: 'P-MCQ-21',
    difficulty: 5,
    question:
      'Which option is the BEST comparison of thermoplastics vs thermosets?',
    options: [
      'Thermoplastics are always stronger than thermosets',
      'Thermoplastics can be remoulded; thermosets cure to a rigid cross-linked network',
      'Thermosets are recyclable because they melt repeatedly',
      'Thermoplastics are cross-linked; thermosets are not',
    ],
    correctIndex: 1,
    explanation: 'That’s the key difference GCSE mark schemes are looking for.',
  },
  {
    id: 'P-MCQ-22',
    difficulty: 5,
    question:
      'A phone case needs impact resistance and mouldability at high volume. Best option?',
    options: [
      'Melamine formaldehyde',
      'ABS',
      'Epoxy resin',
      'Urea formaldehyde',
    ],
    correctIndex: 1,
    explanation:
      'ABS is tough/impact resistant and suits mass manufacturing for cases.',
  },
  {
    id: 'P-MCQ-23',
    difficulty: 5,
    question:
      'Which answer shows the most accurate reasoning for choosing PET for packaging?',
    options: [
      'PET is a thermoset so it cannot be reshaped',
      'PET is tough, can be clear, and forms well for bottles and trays',
      'PET is a metal alloy so it is very strong',
      'PET is used because it is a great electrical insulator for wiring',
    ],
    correctIndex: 1,
    explanation:
      'PET’s properties match packaging needs: tough, lightweight, often clear and formable.',
  },
  {
    id: 'P-MCQ-24',
    difficulty: 5,
    question:
      "A student says: 'Thermosets can be reshaped if you heat them enough.' Best response?",
    options: [
      'Correct — all plastics will reshape eventually',
      'Incorrect — cross-links stop polymer chains sliding, so they don’t remould',
      'Correct — thermosets are the easiest to recycle',
      'Incorrect — thermoplastics are cross-linked, not thermosets',
    ],
    correctIndex: 1,
    explanation:
      'Thermosets don’t remould because cross-links prevent chains moving past each other.',
  },
  {
    id: 'P-MCQ-25',
    difficulty: 5,
    question:
      "Which answer is most likely to earn full marks in a 'justify material choice' question?",
    options: [
      'Use melamine because it is good',
      'Use ABS because it’s plastic',
      'Use melamine: thermoset, heat resistant, electrical insulator; suitable for plug sockets',
      'Use acrylic: it looks nice so it must be right',
    ],
    correctIndex: 2,
    explanation:
      'Full marks = named material + type + key properties + specific use.',
  },
];

const PLASTICS_SHORT = [
  {
    id: 'P-SA-01',
    marks: 2,
    question: 'Define ‘thermoplastic’ in your own words.',
    markScheme: {
      points: [
        {
          id: 'a',
          marks: 1,
          idea: 'Softens when heated',
          keywords: ['soften', 'heat', 'heated'],
        },
        {
          id: 'b',
          marks: 1,
          idea: 'Can be reshaped / remoulded',
          keywords: [
            'reshape',
            'remould',
            're-mould',
            'reheated',
            'reprocess',
            'recycled',
          ],
        },
      ],
    },
  },
  {
    id: 'P-SA-02',
    marks: 3,
    question:
      'Explain two differences between thermoplastics and thermosetting plastics.',
    markScheme: {
      points: [
        {
          id: 'a',
          marks: 1,
          idea: 'Thermoplastics can be reheated/remoulded',
          keywords: ['reheated', 'remould', 'reshape', 'soften'],
        },
        {
          id: 'b',
          marks: 1,
          idea: 'Thermosets cure/cross-link and cannot be reshaped',
          keywords: ['cure', 'cross-link', 'set', 'cannot be reshaped'],
        },
        {
          id: 'c',
          marks: 1,
          idea: 'Named example linked to correct type',
          keywords: ['ABS', 'PET', 'HDPE', 'acrylic', 'melamine', 'epoxy'],
        },
      ],
    },
  },
  {
    id: 'P-SA-03',
    marks: 3,
    question:
      'State one suitable polymer for a plug socket casing and explain why.',
    markScheme: {
      points: [
        {
          id: 'a',
          marks: 1,
          idea: 'Names a suitable polymer',
          keywords: ['melamine', 'phenol', 'bakelite'],
        },
        {
          id: 'b',
          marks: 1,
          idea: 'Heat resistant',
          keywords: ['heat', 'temperature', 'heat resistant'],
        },
        {
          id: 'c',
          marks: 1,
          idea: 'Electrical insulator',
          keywords: ['insulator', 'insulating', 'electrical'],
        },
      ],
    },
  },
  {
    id: 'P-SA-04',
    marks: 4,
    question: 'Give two polymer finishes and explain what each one achieves.',
    markScheme: {
      points: [
        {
          id: 'a',
          marks: 1,
          idea: 'Names finish 1',
          keywords: [
            'polish',
            'textur',
            'spray',
            'paint',
            'plate',
            'rubber',
            'flock',
            'laser',
          ],
        },
        {
          id: 'b',
          marks: 1,
          idea: 'Explains effect of finish 1',
          keywords: [
            'gloss',
            'smooth',
            'grip',
            'protect',
            'comfort',
            'soft',
            'pattern',
            'appearance',
          ],
        },
        {
          id: 'c',
          marks: 1,
          idea: 'Names finish 2',
          keywords: [
            'polish',
            'textur',
            'spray',
            'paint',
            'plate',
            'rubber',
            'flock',
            'laser',
          ],
        },
        {
          id: 'd',
          marks: 1,
          idea: 'Explains effect of finish 2',
          keywords: [
            'gloss',
            'smooth',
            'grip',
            'protect',
            'comfort',
            'soft',
            'pattern',
            'appearance',
          ],
        },
      ],
    },
  },
];

const PLASTICS_LONG = [
  {
    id: 'P-LA-01',
    marks: 6,
    commandWord: 'Analyse',
    question:
      'Analyse the suitability of thermoforming and thermosetting plastics for use in household products. Use at least two examples.',
    markScheme: {
      bands: [
        {
          marks: '1–2',
          criteria:
            'Basic statements about the two types. Limited accuracy/examples.',
        },
        {
          marks: '3–4',
          criteria:
            'Clear explanation of properties linked to uses. Some correct examples.',
        },
        {
          marks: '5–6',
          criteria:
            'Detailed comparison using correct terminology (e.g. cross-links, curing). Multiple justified examples.',
        },
      ],
      keywords: [
        'thermoplastic',
        'thermoset',
        'cross-links',
        'cure',
        'heat resistant',
        'reshape',
        'ABS',
        'melamine',
        'epoxy',
        'PET',
        'HDPE',
      ],
    },
  },
  {
    id: 'P-LA-02',
    marks: 8,
    commandWord: 'Evaluate',
    question:
      'Evaluate the best polymer choice for a protective electronics case used outdoors. Consider properties, finishes, and sustainability.',
    markScheme: {
      bands: [
        { marks: '1–2', criteria: 'Simple choice with weak reasoning.' },
        {
          marks: '3–5',
          criteria:
            'Good reasoning using several properties and at least one finish; some sustainability comment.',
        },
        {
          marks: '6–8',
          criteria:
            'Balanced evaluation (pros/cons), finish choice justified, sustainability discussed clearly (recycling, longevity, waste).',
        },
      ],
      keywords: [
        'impact',
        'tough',
        'ABS',
        'HDPE',
        'rubberising',
        'texturing',
        'UV',
        'recycle',
        'thermoplastic',
        'sustain',
      ],
    },
  },
];

// For brevity here, please paste the PLASTICS_MCQ, PLASTICS_SHORT and PLASTICS_LONG
// arrays from the version that was already working in your StackBlitz.
// (They are unchanged and will slot straight back in.)

// ------------- UI components -------------

const Card = ({ title, children }) => (
  <div
    style={{
      borderRadius: 24,
      padding: 20,
      marginBottom: 16,
      background: 'rgba(15,23,42,0.96)',
      border: '1px solid rgba(148,163,184,0.25)',
      boxShadow: '0 22px 60px rgba(0,0,0,0.7)',
      backdropFilter: 'blur(16px)',
      color: TEXT_PRIMARY,
      lineHeight: 1.55,
    }}
  >
    {title ? (
      <h3
        style={{
          marginTop: 0,
          marginBottom: 10,
          fontSize: 18,
          fontWeight: 800,
          color: TEXT_PRIMARY,
        }}
      >
        {title}
      </h3>
    ) : null}
    {children}
  </div>
);

const Pill = ({ text }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '4px 11px',
      borderRadius: 999,
      marginRight: 8,
      marginBottom: 8,
      background: 'rgba(37,99,235,0.16)',
      color: '#bfdbfe',
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 1,
      textTransform: 'uppercase',
    }}
  >
    {text}
  </span>
);

const Button = ({
  children,
  onClick,
  disabled,
  title,
  variant = 'primary',
}) => {
  const primary = {
    background: disabled
      ? 'linear-gradient(to right, #1d4ed8, #1d4ed8)'
      : 'linear-gradient(to right, #2563eb, #22c1c3)',
    color: TEXT_PRIMARY,
    border: 'none',
    boxShadow: disabled ? 'none' : '0 14px 30px rgba(37,99,235,0.55)',
  };

  const ghost = {
    background: 'transparent',
    color: disabled ? '#64748b' : TEXT_PRIMARY,
    border: '1px solid rgba(148,163,184,0.5)',
    boxShadow: 'none',
  };

  const style = variant === 'ghost' ? ghost : primary;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '10px 16px',
        borderRadius: 999,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 800,
        fontSize: 14,
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
};

const Toggle = ({ checked, onChange }) => (
  <div
    onClick={() => onChange(!checked)}
    style={{
      width: 46,
      height: 26,
      borderRadius: 999,
      background: checked
        ? 'linear-gradient(to right, #2563eb, #22c1c3)'
        : 'rgba(15,23,42,0.9)',
      border: '1px solid rgba(148,163,184,0.45)',
      display: 'flex',
      alignItems: 'center',
      padding: 3,
      cursor: 'pointer',
      justifyContent: checked ? 'flex-end' : 'flex-start',
      transition: 'all 0.2s ease',
    }}
  >
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#e5e7eb',
        boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
      }}
    />
  </div>
);

// ------------- AI mark call -------------

async function aiMark({ question, studentAnswer, markScheme, maxMarks }) {
  const res = await fetch(MARK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, studentAnswer, markScheme, maxMarks }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Marking failed (${res.status}): ${t}`);
  }
  return res.json();
}

// ------------- main App -------------

export default function App() {
  const [store, setStore] = useState(() => loadStore());
  const [page, setPage] = useState('landing'); // main router
  const [selectedTopic, setSelectedTopic] = useState('Plastics');
  const [newStudentName, setNewStudentName] = useState('');

  // quiz state
  const [mcqIndex, setMcqIndex] = useState(0);
  const [mcqSelected, setMcqSelected] = useState(null);
  const [mcqRevealed, setMcqRevealed] = useState(false);

  const [shortIndex, setShortIndex] = useState(0);
  const [longIndex, setLongIndex] = useState(0);
  const [answerText, setAnswerText] = useState('');
  const [marking, setMarking] = useState(false);
  const [markResult, setMarkResult] = useState(null);
  const [markError, setMarkError] = useState('');

  const fileRef = useRef(null);
  const lastPageRef = useRef({ page: 'landing', ts: Date.now() });

  const student =
    store.students.find((s) => s.id === store.activeStudentId) ||
    store.students[0];
  const greeting = timeGreeting();

  // persist
  useEffect(() => saveStore(store), [store]);

  // ensure topic progress object exists
  useEffect(() => {
    setStore((prev) => {
      const s = { ...prev };
      if (!s.progress[s.activeStudentId]) s.progress[s.activeStudentId] = {};
      if (!s.progress[s.activeStudentId][selectedTopic]) {
        s.progress[s.activeStudentId][selectedTopic] = {
          gates: {
            videoDone: false,
            infoDone: false,
            mcqDone: false,
            shortDone: false,
            longDone: false,
          },
          mcq: { attempts: 0, correct: 0, history: [] },
          short: { attempts: 0, best: 0, history: [] },
          long: { attempts: 0, best: 0, history: [] },
          timeSeconds: 0,
        };
      }
      return s;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.activeStudentId, selectedTopic]);

  const prog = store.progress?.[store.activeStudentId]?.[selectedTopic] || {
    gates: {
      videoDone: false,
      infoDone: false,
      mcqDone: false,
      shortDone: false,
      longDone: false,
    },
    mcq: { attempts: 0, correct: 0, history: [] },
    short: { attempts: 0, best: 0, history: [] },
    long: { attempts: 0, best: 0, history: [] },
    timeSeconds: 0,
  };

  const canGoInfo = prog.gates.videoDone;
  const canGoMcq = prog.gates.videoDone && prog.gates.infoDone;
  const canGoShort = prog.gates.mcqDone;
  const canGoLong = prog.gates.shortDone;

  const isPlastics = selectedTopic === 'Plastics';
  const learn = isPlastics ? PLASTICS_LEARN : null;
  const mcq = isPlastics ? PLASTICS_MCQ : [];
  const currentMcq = mcq.length
    ? mcq[clamp(mcqIndex, 0, mcq.length - 1)]
    : null;
  const mcqAccuracy = prog.mcq.attempts
    ? Math.round((prog.mcq.correct / prog.mcq.attempts) * 100)
    : 0;

  const shortQ = isPlastics
    ? PLASTICS_SHORT[clamp(shortIndex, 0, PLASTICS_SHORT.length - 1)]
    : null;
  const longQ = isPlastics
    ? PLASTICS_LONG[clamp(longIndex, 0, PLASTICS_LONG.length - 1)]
    : null;

  const studentProgressAllTopics =
    store.progress?.[store.activeStudentId] || {};
  const overall = overallPercent(studentProgressAllTopics);
  const avgScore = averageMcqAcrossTopics(studentProgressAllTopics);
  const totalSeconds = store.time?.[store.activeStudentId] || 0;

  // time tracking: on each page change, add time spent on previous learning page
  useEffect(() => {
    const now = Date.now();
    const prev = lastPageRef.current;
    const prevPage = prev.page;
    const dtSec = Math.max(0, Math.round((now - prev.ts) / 1000));

    if (TIME_PAGES.includes(prevPage) && dtSec > 0) {
      setStore((prevStore) => {
        const s = { ...prevStore };
        const sid = s.activeStudentId;

        s.time = s.time || {};
        s.time[sid] = (s.time[sid] || 0) + dtSec;

        if (!s.progress[sid]) s.progress[sid] = {};
        const topicId = selectedTopic;
        const baseTopic = s.progress[sid][topicId] || {
          gates: {
            videoDone: false,
            infoDone: false,
            mcqDone: false,
            shortDone: false,
            longDone: false,
          },
          mcq: { attempts: 0, correct: 0, history: [] },
          short: { attempts: 0, best: 0, history: [] },
          long: { attempts: 0, best: 0, history: [] },
          timeSeconds: 0,
        };
        s.progress[sid][topicId] = {
          ...baseTopic,
          timeSeconds: (baseTopic.timeSeconds || 0) + dtSec,
        };
        return s;
      });
    }

    lastPageRef.current = { page, ts: now };
  }, [page, selectedTopic]);

  function clearMarkingUI() {
    setMarkResult(null);
    setMarkError('');
  }

  function go(nextPage) {
    setPage(nextPage);
    clearMarkingUI();
    setAnswerText('');
    setMarking(false);
  }

  function setActiveStudent(id) {
    setStore((prev) => ({ ...prev, activeStudentId: id }));
    setPage('landing');
    setMcqIndex(0);
    setMcqSelected(null);
    setMcqRevealed(false);
    setShortIndex(0);
    setLongIndex(0);
    clearMarkingUI();
  }

  function addStudent() {
    const name = newStudentName.trim();
    if (!name) return;
    const id = `student_${Math.random()
      .toString(36)
      .slice(2, 9)}_${Date.now().toString(36)}`;
    setStore((prev) => ({
      ...prev,
      students: [...prev.students, { id, name }],
      activeStudentId: id,
    }));
    setNewStudentName('');
    setPage('landing');
  }

  function deleteStudent(id) {
    setStore((prev) => {
      if (prev.students.length <= 1) return prev;
      const students = prev.students.filter((s) => s.id !== id);
      const progress = { ...prev.progress };
      const time = { ...prev.time };
      const prefs = { ...prev.prefs };
      delete progress[id];
      delete time[id];
      delete prefs[id];
      const activeStudentId =
        prev.activeStudentId === id ? students[0].id : prev.activeStudentId;
      return { ...prev, students, progress, time, prefs, activeStudentId };
    });
    setPage('landing');
  }

  function resetStudentProgress() {
    setStore((prev) => {
      const progress = { ...prev.progress };
      progress[prev.activeStudentId] = {};
      return { ...prev, progress };
    });
    setPage('landing');
  }

  function exportProgress() {
    downloadJSON(store, 'gcse_pd_progress.json');
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        const merged = { ...safeDefaultStore(), ...parsed };
        setStore(merged);
        setPage('landing');
      } catch (e) {
        alert('Import failed: ' + String(e));
      }
    };
    reader.readAsText(file);
  }

  // profile prefs
  const defaultPrefs = { reminderTime: '18:00', push: false, haptic: false };
  const currentPrefs = store.prefs?.[store.activeStudentId] || defaultPrefs;

  function updatePrefs(patch) {
    setStore((prev) => {
      const s = { ...prev };
      const sid = s.activeStudentId;
      s.prefs = s.prefs || {};
      const cur = s.prefs[sid] || defaultPrefs;
      s.prefs[sid] = { ...cur, ...patch };
      return s;
    });
  }

  // progress update helpers
  function completeGate(field) {
    setStore((prev) => {
      const s = { ...prev };
      const sid = s.activeStudentId;
      if (!s.progress[sid]) s.progress[sid] = {};
      const topicId = selectedTopic;
      const p = s.progress[sid][topicId] || prog;
      p.gates = { ...p.gates, [field]: true };
      s.progress[sid][topicId] = p;
      return s;
    });
  }

  function completeVideo() {
    completeGate('videoDone');
  }

  function completeInfo() {
    completeGate('infoDone');
  }

  function recordMcqAnswer(isCorrect) {
    setStore((prev) => {
      const s = { ...prev };
      const sid = s.activeStudentId;
      if (!s.progress[sid]) s.progress[sid] = {};
      const topicId = selectedTopic;
      const p = s.progress[sid][topicId] || prog;
      p.mcq = { ...(p.mcq || { attempts: 0, correct: 0, history: [] }) };
      p.mcq.attempts += 1;
      if (isCorrect) p.mcq.correct += 1;
      p.mcq.history = [
        ...(p.mcq.history || []),
        {
          id: currentMcq.id,
          ts: nowISO(),
          correct: isCorrect,
          difficulty: currentMcq.difficulty,
        },
      ];
      s.progress[sid][topicId] = p;
      return s;
    });
  }

  function finishMcqIfReady() {
    const attempted = prog.mcq.history?.length || 0;
    const acc = prog.mcq.attempts
      ? (prog.mcq.correct / prog.mcq.attempts) * 100
      : 0;
    if (attempted >= (isPlastics ? PLASTICS_MCQ.length : 0) && acc >= 70) {
      completeGate('mcqDone');
      return true;
    }
    return false;
  }

  async function markAnswer(kind) {
    setMarking(true);
    setMarkError('');
    setMarkResult(null);

    try {
      const q = kind === 'short' ? shortQ : longQ;
      const payload = {
        question:
          kind === 'long' ? `${q.commandWord}: ${q.question}` : q.question,
        studentAnswer: answerText,
        markScheme: q.markScheme,
        maxMarks: q.marks,
      };

      const result = await aiMark(payload);
      setMarkResult(result);

      setStore((prev) => {
        const s = { ...prev };
        const sid = s.activeStudentId;
        if (!s.progress[sid]) s.progress[sid] = {};
        const topicId = selectedTopic;
        const p = s.progress[sid][topicId] || prog;
        const bucket = kind === 'short' ? 'short' : 'long';
        const prevBucket = p[bucket] || { attempts: 0, best: 0, history: [] };
        const score = Number(result?.score ?? 0);

        const updated = {
          ...prevBucket,
          attempts: prevBucket.attempts + 1,
          best: Math.max(prevBucket.best || 0, score),
          history: [
            ...(prevBucket.history || []),
            {
              qid: q.id,
              ts: nowISO(),
              score,
              max: q.marks,
              feedback: result?.feedback || '',
              improvements: result?.improvements || [],
            },
          ],
        };

        p[bucket] = updated;

        if (kind === 'short') {
          const passed = updated.history.filter(
            (h) => (h.score / h.max) * 100 >= 60
          );
          const uniquePassed = new Set(passed.map((h) => h.qid));
          if (uniquePassed.size >= 2) p.gates = { ...p.gates, shortDone: true };
        } else {
          if ((score / q.marks) * 100 >= 60)
            p.gates = { ...p.gates, longDone: true };
        }

        s.progress[sid][topicId] = p;
        return s;
      });
    } catch (e) {
      setMarkError(String(e?.message || e));
    } finally {
      setMarking(false);
    }
  }

  // nav highlighting
  function activeTab() {
    if (['landing', 'video', 'info'].includes(page)) return 'home';
    if (['topics', 'comingSoon'].includes(page)) return 'topics';
    if (['revision', 'flashcards', 'ko'].includes(page)) return 'revision';
    if (['progress'].includes(page)) return 'progress';
    if (['profile'].includes(page)) return 'profile';
    return 'home';
  }

  const currentTab = activeTab();

  // ------------- render -------------

  return (
    <div
      style={{
        padding: 24,
        fontFamily:
          "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background:
          'radial-gradient(circle at top, #0f172a 0, #020617 45%, #000 100%)',
        minHeight: '100vh',
        color: '#f1f5f9',
      }}
    >
      <div style={{ maxWidth: 420, margin: '0 auto', paddingBottom: 70 }}>
        {/* header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                color: TEXT_MUTED,
                letterSpacing: 1,
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >
              GCSE Product Design
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1 }}>
              Revision Hub
            </div>
            <div style={{ marginTop: 6, color: TEXT_SECONDARY, fontSize: 13 }}>
              Topic:{' '}
              <strong style={{ color: TEXT_PRIMARY }}>{selectedTopic}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={exportProgress}>
              Export
            </Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importProgress(f);
                e.target.value = '';
              }}
            />
          </div>
        </header>

        <div style={{ height: 14 }} />

        {/* Student selector */}
        <Card title="Student">
          <div
            style={{
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Select student
              </div>
              <select
                value={store.activeStudentId}
                onChange={(e) => setActiveStudent(e.target.value)}
                style={{
                  width: 220,
                  padding: 10,
                  borderRadius: 14,
                  background: 'rgba(2,6,23,0.75)',
                  border: '1px solid rgba(148,163,184,0.35)',
                  color: TEXT_PRIMARY,
                  outline: 'none',
                }}
              >
                {store.students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <Button
                  variant="ghost"
                  onClick={() => deleteStudent(store.activeStudentId)}
                  disabled={store.students.length <= 1}
                >
                  Delete
                </Button>
                <Button variant="ghost" onClick={resetStudentProgress}>
                  Reset progress
                </Button>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Add student
              </div>
              <input
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="e.g., Idris"
                style={{
                  width: 220,
                  padding: 10,
                  borderRadius: 14,
                  background: 'rgba(2,6,23,0.75)',
                  border: '1px solid rgba(148,163,184,0.35)',
                  color: TEXT_PRIMARY,
                  outline: 'none',
                }}
              />
              <div style={{ marginTop: 10 }}>
                <Button onClick={addStudent}>Add</Button>
              </div>
            </div>

            <div style={{ flex: 1 }} />

            <div
              style={{ color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.6 }}
            >
              Gates:{' '}
              <strong style={{ color: TEXT_PRIMARY }}>
                V {prog.gates.videoDone ? '✓' : '—'} · I{' '}
                {prog.gates.infoDone ? '✓' : '—'} · M{' '}
                {prog.gates.mcqDone ? '✓' : '—'} · S{' '}
                {prog.gates.shortDone ? '✓' : '—'} · L{' '}
                {prog.gates.longDone ? '✓' : '—'}
              </strong>
              <div style={{ marginTop: 4 }}>
                MCQ accuracy:{' '}
                <strong style={{ color: TEXT_PRIMARY }}>{mcqAccuracy}%</strong>{' '}
                ({prog.mcq.correct}/{prog.mcq.attempts})
              </div>
            </div>
          </div>
        </Card>

        {/* pages */}
        {page === 'landing' && (
          <Card title="">
            <p
              style={{
                marginTop: 0,
                fontSize: 12,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: TEXT_MUTED,
                fontWeight: 900,
              }}
            >
              WJEC SYLLABUS
            </p>

            <p
              style={{
                marginTop: 4,
                fontSize: 30,
                lineHeight: 1.1,
                fontWeight: 950,
                color: TEXT_PRIMARY,
              }}
            >
              {greeting}, {student?.name}.
              <br />
              Master Product Design
            </p>

            <p
              style={{
                marginTop: 10,
                fontSize: 13,
                color: TEXT_SECONDARY,
                maxWidth: 340,
                lineHeight: 1.6,
              }}
            >
              Watch the video, read the notes, then test yourself with MCQs and
              AI-marked exam questions. Your progress saves automatically.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                marginTop: 16,
              }}
            >
              <Button onClick={() => go('topics')}>Start Revising Now</Button>
              <Button variant="ghost" onClick={() => go('progress')}>
                View Progress
              </Button>
            </div>
          </Card>
        )}

        {page === 'topics' && (
          <TopicSelectionPage
            store={store}
            activeStudentId={store.activeStudentId}
            selectedTopic={selectedTopic}
            onPickTopic={(picked) => {
              setSelectedTopic(picked);
              if (picked !== 'Plastics') {
                go('comingSoon');
              } else {
                setMcqIndex(0);
                setMcqSelected(null);
                setMcqRevealed(false);
                setShortIndex(0);
                setLongIndex(0);
                clearMarkingUI();
                setAnswerText('');
                go('video');
              }
            }}
          />
        )}

        {page === 'comingSoon' && (
          <Card title="Coming soon">
            <div
              style={{ color: TEXT_SECONDARY, fontSize: 14, lineHeight: 1.6 }}
            >
              <strong style={{ color: TEXT_PRIMARY }}>{selectedTopic}</strong>{' '}
              is in the topic list, but the content hasn’t been added yet.
              <br />
              <br />
              For now, the fully built module is:{' '}
              <strong style={{ color: TEXT_PRIMARY }}>Plastics</strong>.
            </div>

            <div
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <Button
                onClick={() => {
                  setSelectedTopic('Plastics');
                  go('video');
                }}
              >
                Go to Plastics
              </Button>
              <Button variant="ghost" onClick={() => go('topics')}>
                Back to Topics
              </Button>
            </div>
          </Card>
        )}

        {page === 'video' && isPlastics && (
          <VideoPage
            learn={learn}
            prog={prog}
            onComplete={completeVideo}
            onGo={go}
          />
        )}

        {page === 'info' && isPlastics && (
          <InfoPage
            learn={learn}
            prog={prog}
            onComplete={completeInfo}
            onGo={go}
          />
        )}

        {page === 'mcq' && isPlastics && currentMcq && (
          <McqPage
            mcq={mcq}
            current={currentMcq}
            index={mcqIndex}
            setIndex={setMcqIndex}
            selected={mcqSelected}
            setSelected={setMcqSelected}
            revealed={mcqRevealed}
            setRevealed={setMcqRevealed}
            onRecord={recordMcqAnswer}
            prog={prog}
            onFinishCheck={finishMcqIfReady}
            onGo={go}
          />
        )}

        {page === 'short' && isPlastics && shortQ && (
          <AiAnswerPage
            kind="short"
            title="Short Answers (AI-marked)"
            qList={PLASTICS_SHORT}
            qIndex={shortIndex}
            setQIndex={setShortIndex}
            q={shortQ}
            answerText={answerText}
            setAnswerText={setAnswerText}
            marking={marking}
            markResult={markResult}
            markError={markError}
            onMark={() => markAnswer('short')}
            onClearMarking={clearMarkingUI}
            prog={prog}
            onGo={go}
          />
        )}

        {page === 'long' && isPlastics && longQ && (
          <AiAnswerPage
            kind="long"
            title="Long Answers (AI-marked)"
            qList={PLASTICS_LONG}
            qIndex={longIndex}
            setQIndex={setLongIndex}
            q={longQ}
            answerText={answerText}
            setAnswerText={setAnswerText}
            marking={marking}
            markResult={markResult}
            markError={markError}
            onMark={() => markAnswer('long')}
            onClearMarking={clearMarkingUI}
            prog={prog}
            onGo={go}
          />
        )}

        {page === 'progress' && (
          <ProgressDashboard
            student={student}
            progressAll={studentProgressAllTopics}
            totalSeconds={totalSeconds}
            overall={overall}
            avgScore={avgScore}
            onGo={go}
          />
        )}

        {page === 'profile' && (
          <ProfilePage
            student={student}
            prefs={currentPrefs}
            overall={overall}
            streakDays={12} // placeholder
            onUpdatePrefs={updatePrefs}
            onGo={go}
          />
        )}
        {page === 'revision' && <RevisionPage onGo={go} />}

        {page === 'flashcards' && (
          <FlashcardsPage selectedTopic={selectedTopic} onGo={go} />
        )}

        {page === 'ko' && <KnowledgeOrganisersPage onGo={go} />}

        <div
          style={{
            marginTop: 14,
            color: TEXT_MUTED,
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          If the school network blocks embedded YouTube, use the “Open on
          YouTube” fallback button.
        </div>

        {/* bottom nav */}
        <nav
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '8px 18px 12px',
            background: 'rgba(15,23,42,0.98)',
            borderTop: '1px solid rgba(15,23,42,0.9)',
            display: 'flex',
            justifyContent: 'space-between',
            maxWidth: 420,
            margin: '0 auto',
          }}
        >
          <NavItem
            label="Home"
            icon="🏠"
            active={currentTab === 'home'}
            onClick={() => go('landing')}
          />
          <NavItem
            label="Topics"
            icon="📘"
            active={currentTab === 'topics'}
            onClick={() => go('topics')}
          />
          <NavItem
            label="Revision"
            icon="📗"
            active={currentTab === 'revision'}
            onClick={() => go('revision')}
          />
          <NavItem
            label="Progress"
            icon="📊"
            active={currentTab === 'progress'}
            onClick={() => go('progress')}
          />
          <NavItem
            label="Profile"
            icon="👤"
            active={currentTab === 'profile'}
            onClick={() => go('profile')}
          />
        </nav>
      </div>
    </div>
  );
}

// ------- shared small components -------

function NavItem({ label, icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        border: 'none',
        background: 'transparent',
        color: active ? '#60a5fa' : TEXT_SECONDARY,
        fontSize: 11,
        fontWeight: active ? 900 : 700,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function TopicSelectionPage({
  store,
  activeStudentId,
  selectedTopic,
  onPickTopic,
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All'); // All | Unit 1 | Unit 2

  const studentProgress = store.progress?.[activeStudentId] || {};
  const overall = overallPercent(studentProgress);

  const filtered = TOPIC_CATALOG.filter((t) => {
    const matchesFilter = filter === 'All' ? true : t.unit === filter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      t.label.toLowerCase().includes(q) ||
      t.subtitle.toLowerCase().includes(q) ||
      t.module.toLowerCase().includes(q);
    return matchesFilter && matchesQuery;
  });

  const grouped = filtered.reduce((acc, t) => {
    acc[t.module] = acc[t.module] || [];
    acc[t.module].push(t);
    return acc;
  }, {});

  return (
    <Card title="">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={{ color: TEXT_SECONDARY, fontWeight: 900 }}>
          Topic Selection
        </div>
      </div>

      <div
        style={{
          fontSize: 32,
          fontWeight: 950,
          lineHeight: 1.05,
          marginTop: 6,
        }}
      >
        What are we revising
        <br />
        today?
      </div>

      <div style={{ marginTop: 14 }}>
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            padding: '12px 14px',
            borderRadius: 16,
            background: 'rgba(2,6,23,0.7)',
            border: '1px solid rgba(148,163,184,0.22)',
          }}
        >
          <span style={{ color: TEXT_MUTED }}>🔎</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topics (e.g. Polymers, CAD)"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: TEXT_PRIMARY,
              fontSize: 14,
            }}
          />
        </div>
      </div>

      <div
        style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}
      >
        <Button
          variant={filter === 'All' ? 'primary' : 'ghost'}
          onClick={() => setFilter('All')}
        >
          All Topics
        </Button>
        <Button
          variant={filter === 'Unit 1' ? 'primary' : 'ghost'}
          onClick={() => setFilter('Unit 1')}
        >
          Unit 1: Written
        </Button>
        <Button
          variant={filter === 'Unit 2' ? 'primary' : 'ghost'}
          onClick={() => setFilter('Unit 2')}
        >
          Unit 2: Design
        </Button>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 18,
          background: 'rgba(2,6,23,0.55)',
          border: '1px solid rgba(148,163,184,0.22)',
        }}
      >
        <div
          style={{
            color: TEXT_MUTED,
            fontSize: 12,
            letterSpacing: 1,
            fontWeight: 900,
          }}
        >
          OVERALL PROGRESS
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            marginTop: 6,
          }}
        >
          <div style={{ fontSize: 34, fontWeight: 950 }}>{overall}%</div>
          <div style={{ color: TEXT_SECONDARY, fontWeight: 900 }}>Complete</div>
          <div
            style={{ marginLeft: 'auto', color: '#60a5fa', fontWeight: 950 }}
          >
            {Math.round((overall / 100) * TOPIC_CATALOG.length)}/
            {TOPIC_CATALOG.length}
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            height: 10,
            borderRadius: 999,
            background: 'rgba(148,163,184,0.18)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${overall}%`,
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(to right, #2563eb, #22c1c3)',
            }}
          />
        </div>

        <div style={{ marginTop: 10, color: TEXT_SECONDARY, fontSize: 13 }}>
          Selected topic:{' '}
          <strong style={{ color: TEXT_PRIMARY }}>{selectedTopic}</strong>
        </div>
      </div>

      <div style={{ marginTop: 18, fontSize: 18, fontWeight: 950 }}>
        Modules
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {Object.entries(grouped).map(([moduleName, topics]) => (
          <div key={moduleName} style={{ display: 'grid', gap: 12 }}>
            {topics.map((t) => {
              const p = studentProgress?.[t.id];
              const pct = topicPercent(p);
              const status =
                pct === 0
                  ? 'Not started'
                  : pct === 100
                  ? 'Complete'
                  : `${pct}%`;
              const icon = t.module.includes('Materials')
                ? '🧪'
                : t.module.includes('Industrial')
                ? '🏭'
                : t.module.includes('CAD')
                ? '💻'
                : '♻️';
              const enabled = t.id === 'Plastics';

              return (
                <div
                  key={t.id}
                  onClick={() => onPickTopic(t.id)}
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    background: 'rgba(2,6,23,0.55)',
                    border: '1px solid rgba(148,163,184,0.22)',
                    cursor: 'pointer',
                    opacity: enabled ? 1 : 0.75,
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        background: 'rgba(37,99,235,0.18)',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 950,
                        color: '#bfdbfe',
                      }}
                    >
                      {icon}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 950 }}>
                        {t.label}
                      </div>
                      <div
                        style={{
                          color: TEXT_SECONDARY,
                          fontSize: 13,
                          lineHeight: 1.4,
                        }}
                      >
                        {t.subtitle}
                      </div>
                      {!enabled && (
                        <div
                          style={{
                            color: TEXT_MUTED,
                            fontSize: 12,
                            marginTop: 4,
                          }}
                        >
                          Coming soon
                        </div>
                      )}
                    </div>

                    <div style={{ color: TEXT_MUTED, fontWeight: 950 }}>›</div>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius: 999,
                        background: 'rgba(148,163,184,0.18)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          borderRadius: 999,
                          background:
                            'linear-gradient(to right, #2563eb, #22c1c3)',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        width: 90,
                        textAlign: 'right',
                        color: TEXT_SECONDARY,
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      {status}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function VideoPage({ learn, prog, onComplete, onGo }) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <Card title={`${learn.topic} – Video`}>
      <p
        style={{
          marginTop: 0,
          color: TEXT_SECONDARY,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Watch the video first. When you’re done, click{' '}
        <strong style={{ color: TEXT_PRIMARY }}>“I’ve watched it”</strong> to
        unlock Info.
      </p>

      <div style={{ maxWidth: 780 }}>
        <div
          style={{
            position: 'relative',
            paddingBottom: '56.25%',
            height: 0,
            overflow: 'hidden',
            borderRadius: 16,
            border: '1px solid rgba(148,163,184,0.25)',
          }}
        >
          <iframe
            src={learn.video.embedSrc}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        </div>

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Button onClick={onComplete} disabled={prog.gates.videoDone}>
            {prog.gates.videoDone ? 'Watched ✓' : 'I’ve watched it'}
          </Button>

          <a
            href={learn.video.watchUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-block',
              padding: '10px 16px',
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.5)',
              background: 'transparent',
              textDecoration: 'none',
              color: TEXT_PRIMARY,
              fontWeight: 900,
              fontSize: 14,
            }}
          >
            ▶ Open on YouTube
          </a>

          <Button variant="ghost" onClick={() => setShowHelp((v) => !v)}>
            {showHelp ? 'Hide help' : 'Video not showing?'}
          </Button>
          <Button variant="ghost" onClick={() => onGo('topics')}>
            Back
          </Button>
          <Button
            onClick={() => onGo('info')}
            disabled={!prog.gates.videoDone}
            title={!prog.gates.videoDone ? 'Complete video first' : ''}
          >
            Next: Info
          </Button>
        </div>

        {showHelp && (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              border: '1px solid rgba(148,163,184,0.25)',
              borderRadius: 16,
              background: 'rgba(2,6,23,0.55)',
              color: TEXT_SECONDARY,
            }}
          >
            <strong style={{ color: TEXT_PRIMARY }}>
              If the video is blank:
            </strong>
            <ul style={{ marginTop: 8, marginBottom: 0 }}>
              <li>Some school networks block embedded YouTube.</li>
              <li>
                Click{' '}
                <strong style={{ color: TEXT_PRIMARY }}>
                  “Open on YouTube”
                </strong>{' '}
                to watch in a new tab.
              </li>
              <li>
                If YouTube is blocked entirely, you may need home Wi-Fi or IT
                support.
              </li>
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function InfoPage({ learn, prog, onComplete, onGo }) {
  return (
    <Card title={`${learn.topic} – Information`}>
      <p
        style={{
          marginTop: 0,
          color: TEXT_SECONDARY,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Read the notes. When you’re done, click{' '}
        <strong style={{ color: TEXT_PRIMARY }}>“I’ve read it”</strong> to
        unlock the MCQ quiz.
      </p>

      {learn.infoSections.map((sec, idx) => (
        <div key={idx} style={{ marginBottom: 14 }}>
          <h4
            style={{
              marginBottom: 8,
              marginTop: 0,
              fontSize: 15,
              color: TEXT_PRIMARY,
            }}
          >
            {sec.heading}
          </h4>
          <ul style={{ marginTop: 0, color: TEXT_SECONDARY }}>
            {sec.bullets.map((b, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {b}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h4 style={{ marginBottom: 8, fontSize: 15, color: TEXT_PRIMARY }}>
        Key words
      </h4>
      <div style={{ marginBottom: 8 }}>
        {learn.keywords.map((k) => (
          <Pill key={k} text={k} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button onClick={onComplete} disabled={prog.gates.infoDone}>
          {prog.gates.infoDone ? 'Read ✓' : 'I’ve read it'}
        </Button>
        <Button variant="ghost" onClick={() => onGo('video')}>
          Back: Video
        </Button>
        <Button
          onClick={() => onGo('mcq')}
          disabled={!prog.gates.infoDone}
          title={!prog.gates.infoDone ? 'Click “I’ve read it” first' : ''}
        >
          Next: MCQ quiz
        </Button>
      </div>
    </Card>
  );
}

function McqPage({
  mcq,
  current,
  index,
  setIndex,
  selected,
  setSelected,
  revealed,
  setRevealed,
  onRecord,
  prog,
  onFinishCheck,
  onGo,
}) {
  const attempted = prog.mcq.history?.length || 0;
  const acc = prog.mcq.attempts
    ? Math.round((prog.mcq.correct / prog.mcq.attempts) * 100)
    : 0;
  const finished = attempted >= mcq.length;

  function submit() {
    if (selected === null) return;
    const isCorrect = selected === current.correctIndex;
    onRecord(isCorrect);
    setRevealed(true);
  }

  function next() {
    setSelected(null);
    setRevealed(false);
    setIndex((prev) => clamp(prev + 1, 0, mcq.length - 1));
  }

  function previous() {
    setSelected(null);
    setRevealed(false);
    setIndex((prev) => clamp(prev - 1, 0, mcq.length - 1));
  }

  return (
    <Card title="Plastics – MCQ Quiz (25 questions)">
      <div
        style={{
          color: TEXT_SECONDARY,
          marginBottom: 12,
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        Unlock rule:{' '}
        <strong style={{ color: TEXT_PRIMARY }}>Attempt all 25</strong> and
        score <strong style={{ color: TEXT_PRIMARY }}>70%+</strong>.
      </div>

      <div style={{ color: TEXT_SECONDARY, marginBottom: 12, fontSize: 13 }}>
        Attempts: <strong style={{ color: TEXT_PRIMARY }}>{attempted}</strong> /{' '}
        {mcq.length} · Accuracy:{' '}
        <strong style={{ color: TEXT_PRIMARY }}>{acc}%</strong>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            color: TEXT_MUTED,
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          Q{index + 1} / {mcq.length} · Difficulty {current.difficulty}
        </div>
        <div
          style={{
            fontSize: 18,
            marginTop: 8,
            fontWeight: 950,
            color: TEXT_PRIMARY,
          }}
        >
          {current.question}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {current.options.map((opt, i) => {
          const isSel = selected === i;
          const isCorrect = revealed && i === current.correctIndex;
          const isWrongSel = revealed && isSel && i !== current.correctIndex;

          return (
            <button
              key={i}
              onClick={() => !revealed && setSelected(i)}
              style={{
                textAlign: 'left',
                padding: 14,
                borderRadius: 14,
                cursor: revealed ? 'default' : 'pointer',
                border: '1px solid rgba(148,163,184,0.35)',
                background: isCorrect
                  ? '#14532d'
                  : isWrongSel
                  ? '#7f1d1d'
                  : isSel
                  ? '#1e3a8a'
                  : '#020617',
                color: TEXT_PRIMARY,
                lineHeight: 1.4,
                fontWeight: 700,
              }}
            >
              {String.fromCharCode(65 + i)}. {opt}
            </button>
          );
        })}
      </div>

      <div
        style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}
      >
        <Button variant="ghost" onClick={previous} disabled={index === 0}>
          Prev
        </Button>
        <Button onClick={submit} disabled={revealed || selected === null}>
          Submit
        </Button>
        <Button
          variant="ghost"
          onClick={next}
          disabled={index === mcq.length - 1}
        >
          Next
        </Button>
        <Button variant="ghost" onClick={() => onGo('info')}>
          Back: Info
        </Button>

        <Button
          onClick={() => {
            const ok = onFinishCheck();
            if (!ok) {
              alert(
                finished
                  ? `You’ve attempted all 25, but your score is ${acc}%. You need 70%+ to unlock short answers.`
                  : `You need to attempt all 25 questions first. Current attempts: ${attempted}/25.`
              );
            } else {
              onGo('short');
            }
          }}
        >
          Check unlock → Short
        </Button>
      </div>

      {revealed && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: 16,
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid rgba(148,163,184,0.3)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
            color: TEXT_PRIMARY,
            lineHeight: 1.5,
          }}
        >
          <div>
            <strong style={{ color: '#e0f2fe' }}>Correct answer:</strong>{' '}
            {String.fromCharCode(65 + current.correctIndex)}.{' '}
            {current.options[current.correctIndex]}
          </div>
          <div style={{ marginTop: 8, color: TEXT_SECONDARY }}>
            {current.explanation}
          </div>
        </div>
      )}
    </Card>
  );
}

function AiAnswerPage({
  kind,
  title,
  qList,
  qIndex,
  setQIndex,
  q,
  answerText,
  setAnswerText,
  marking,
  markResult,
  markError,
  onMark,
  onClearMarking,
  prog,
  onGo,
}) {
  const gateDone =
    kind === 'short' ? prog.gates.shortDone : prog.gates.longDone;

  function nextQ() {
    setQIndex((i) => clamp(i + 1, 0, qList.length - 1));
    setAnswerText('');
    onClearMarking?.();
  }

  function prevQ() {
    setQIndex((i) => clamp(i - 1, 0, qList.length - 1));
    setAnswerText('');
    onClearMarking?.();
  }

  return (
    <Card title={title}>
      <div style={{ marginBottom: 10, fontSize: 13, lineHeight: 1.6 }}>
        {kind === 'short' ? (
          <div style={{ color: TEXT_SECONDARY }}>
            Unlock rule:{' '}
            <strong style={{ color: TEXT_PRIMARY }}>score 60%+</strong> on{' '}
            <strong style={{ color: TEXT_PRIMARY }}>2 different</strong> short
            questions.
          </div>
        ) : (
          <div style={{ color: TEXT_SECONDARY }}>
            Completion rule:{' '}
            <strong style={{ color: TEXT_PRIMARY }}>score 60%+</strong> on a
            long answer to finish this module.
          </div>
        )}

        <div style={{ marginTop: 6, color: TEXT_SECONDARY, fontSize: 13 }}>
          Status:{' '}
          <strong style={{ color: gateDone ? '#86efac' : '#e0f2fe' }}>
            {gateDone ? 'Unlocked/Complete ✓' : 'In progress'}
          </strong>
        </div>
      </div>

      <div
        style={{
          marginBottom: 8,
          color: TEXT_MUTED,
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        Question {qIndex + 1} / {qList.length} · {q.marks} marks
      </div>

      <div
        style={{
          fontSize: 18,
          marginBottom: 12,
          fontWeight: 950,
          color: TEXT_PRIMARY,
        }}
      >
        {kind === 'long' ? `${q.commandWord}: ` : ''}
        {q.question}
      </div>

      <textarea
        value={answerText}
        onChange={(e) => setAnswerText(e.target.value)}
        rows={8}
        placeholder="Type your answer here..."
        style={{
          width: '100%',
          padding: 14,
          borderRadius: 16,
          background: 'rgba(2,6,23,0.75)',
          border: '1px solid rgba(148,163,184,0.35)',
          color: TEXT_PRIMARY,
          outline: 'none',
          lineHeight: 1.5,
          fontSize: 14,
        }}
      />

      <div
        style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}
      >
        <Button variant="ghost" onClick={prevQ} disabled={qIndex === 0}>
          Prev
        </Button>
        <Button
          variant="ghost"
          onClick={nextQ}
          disabled={qIndex === qList.length - 1}
        >
          Next
        </Button>
        <Button
          onClick={onMark}
          disabled={marking || answerText.trim().length < 10}
          title={answerText.trim().length < 10 ? 'Write a bit more first' : ''}
        >
          {marking ? 'Marking…' : 'Mark with AI'}
        </Button>
        <Button variant="ghost" onClick={() => onGo('topics')}>
          Topics
        </Button>

        {kind === 'short' ? (
          <Button
            onClick={() => onGo('long')}
            disabled={!prog.gates.shortDone}
            title={!prog.gates.shortDone ? 'Complete Short Answers first' : ''}
          >
            Next: Long
          </Button>
        ) : (
          <Button onClick={() => onGo('progress')}>View Progress</Button>
        )}
      </div>

      {markError && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: 16,
            background: 'rgba(127,29,29,0.35)',
            border: '1px solid rgba(248,113,113,0.35)',
            color: TEXT_PRIMARY,
            lineHeight: 1.5,
          }}
        >
          <strong>Marking error:</strong> {markError}
          <div style={{ marginTop: 6, color: TEXT_SECONDARY }}>
            Check your backend is running and reachable at{' '}
            <code style={{ color: TEXT_PRIMARY }}>{MARK_ENDPOINT}</code>
          </div>
        </div>
      )}

      {markResult && (
        <div
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: 16,
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid rgba(148,163,184,0.3)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
            color: TEXT_PRIMARY,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontSize: 16 }}>
            <strong style={{ color: '#e0f2fe' }}>Score:</strong>{' '}
            {markResult.score} / {q.marks}
          </div>

          {markResult.feedback && (
            <div style={{ marginTop: 10 }}>
              <strong style={{ color: '#e0f2fe' }}>Feedback:</strong>
              <div style={{ marginTop: 6, color: TEXT_SECONDARY }}>
                {markResult.feedback}
              </div>
            </div>
          )}

          {Array.isArray(markResult.improvements) &&
            markResult.improvements.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ color: '#e0f2fe' }}>
                  How to improve next time:
                </strong>
                <ul style={{ marginTop: 8, color: TEXT_SECONDARY }}>
                  {markResult.improvements.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          color: TEXT_SECONDARY,
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        Note: AI marking is guided by the mark scheme, but you can still review
        answers as the teacher.
      </div>
    </Card>
  );
}

/* -------- Progress dashboard + helpers -------- */

function ProgressDashboard({
  student,
  progressAll,
  totalSeconds,
  overall,
  avgScore,
  onGo,
}) {
  const topicsDone = TOPIC_CATALOG.filter(
    (t) => topicPercent(progressAll?.[t.id]) === 100
  ).length;
  const topicsTotal = TOPIC_CATALOG.length;

  const dev = developmentTargets(progressAll);
  const modules = moduleBreakdown(progressAll);

  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);

  const trackMsg =
    overall >= 70
      ? 'You’re on track for an A grade!'
      : overall >= 55
      ? 'You’re on track for a B grade.'
      : 'Focus on your next steps to boost your grade.';

  return (
    <Card title="">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 950 }}>My Progress</div>
        <Button variant="ghost" onClick={() => onGo('profile')}>
          👤
        </Button>
      </div>

      <div style={{ marginTop: 14, display: 'grid', placeItems: 'center' }}>
        <RingProgress percent={overall} />
        <div
          style={{
            marginTop: 10,
            padding: '10px 14px',
            borderRadius: 999,
            background: 'rgba(2,6,23,0.55)',
            border: '1px solid rgba(148,163,184,0.22)',
          }}
        >
          <span style={{ color: '#86efac', fontWeight: 900 }}>🎉</span>{' '}
          <span style={{ color: TEXT_PRIMARY, fontWeight: 900 }}>
            {trackMsg}
          </span>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 10,
        }}
      >
        <StatCard label="Topics Done" value={`${topicsDone}/${topicsTotal}`} />
        <StatCard label="Avg Score" value={`${avgScore}%`} />
        <StatCard
          label="Time Spent"
          value={
            hours
              ? `${hours}h ${mins.toString().padStart(2, '0')}m`
              : `${mins}m`
          }
        />
      </div>

      <div style={{ marginTop: 18, fontSize: 16, fontWeight: 950 }}>
        Areas to improve next
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
        {dev.length === 0 ? (
          <div style={{ color: TEXT_SECONDARY }}>
            Nice! No urgent gaps detected.
          </div>
        ) : (
          dev.slice(0, 3).map((d) => (
            <div
              key={d.topicId}
              style={{
                padding: 14,
                borderRadius: 16,
                background: 'rgba(2,6,23,0.55)',
                border: '1px solid rgba(148,163,184,0.22)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ fontWeight: 950 }}>{d.topicLabel}</div>
                  <div style={{ color: TEXT_SECONDARY, fontSize: 13 }}>
                    Next step:{' '}
                    <strong style={{ color: TEXT_PRIMARY }}>
                      {d.nextStep}
                    </strong>
                  </div>
                </div>
                <div style={{ color: TEXT_SECONDARY, fontWeight: 900 }}>
                  {d.percent}%
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  height: 8,
                  borderRadius: 999,
                  background: 'rgba(148,163,184,0.18)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${d.percent}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: 'linear-gradient(to right, #2563eb, #22c1c3)',
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <Button onClick={() => onGo('topics')}>Go to topic</Button>
                <Button variant="ghost" onClick={() => alert(d.reason)}>
                  Why?
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 18, fontSize: 16, fontWeight: 950 }}>
        Module Breakdown
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
        {modules.map((m) => (
          <ModuleProgressCard key={m.name} module={m} />
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <Button onClick={() => onGo('topics')}>Continue Learning</Button>
      </div>
    </Card>
  );
}

function RingProgress({ percent }) {
  const size = 210;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (percent / 100) * c;

  return (
    <div style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={stroke}
          fill="none"
        />
        <defs>
          <linearGradient id="gradRing" x1="0" x2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#22c1c3" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#gradRing)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 44, fontWeight: 950 }}>{percent}%</div>
        <div style={{ color: TEXT_SECONDARY, fontWeight: 900 }}>
          Course Complete
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 18,
        background: 'rgba(2,6,23,0.55)',
        border: '1px solid rgba(148,163,184,0.22)',
        minHeight: 92,
      }}
    >
      <div
        style={{
          color: TEXT_MUTED,
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950 }}>{value}</div>
    </div>
  );
}

function ModuleProgressCard({ module }) {
  const icon = module.name.includes('Materials')
    ? '🧪'
    : module.name.includes('Industrial')
    ? '🏭'
    : module.name.includes('CAD')
    ? '💻'
    : '♻️';

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        background: 'rgba(2,6,23,0.55)',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'rgba(37,99,235,0.18)',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 950,
            color: '#bfdbfe',
          }}
        >
          {icon}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 950 }}>{module.name}</div>
          <div style={{ color: TEXT_SECONDARY, fontSize: 13 }}>
            {module.subtitle}
          </div>
        </div>

        <div style={{ fontWeight: 950, color: TEXT_PRIMARY }}>
          {module.percent}%
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          height: 8,
          borderRadius: 999,
          background: 'rgba(148,163,184,0.18)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${module.percent}%`,
            height: '100%',
            borderRadius: 999,
            background: module.gradient,
          }}
        />
      </div>
    </div>
  );
}

/* -------- Profile / settings page -------- */

function ProfilePage({
  student,
  prefs,
  overall,
  streakDays,
  onUpdatePrefs,
  onGo,
}) {
  const level = overall >= 80 ? 6 : overall >= 65 ? 5 : overall >= 50 ? 4 : 3;

  return (
    <Card title="Settings">
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12 }}>
        <div
          style={{
            width: 86,
            height: 86,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 20% 20%, #22c1c3, #2563eb)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
          }}
        >
          <span style={{ fontSize: 36 }}>👤</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 18, fontWeight: 950 }}>
          {student?.name || 'Student'}
        </div>
        <div style={{ marginTop: 4, color: TEXT_SECONDARY, fontSize: 13 }}>
          Level {level} • {streakDays} Day Streak 🔥
        </div>
        <div style={{ marginTop: 10 }}>
          <Button
            variant="ghost"
            onClick={() => alert('Profile editing coming soon')}
          >
            Edit Profile
          </Button>
        </div>
      </div>

      <SectionTitle>Account</SectionTitle>
      <SettingsRow
        icon="🎓"
        label="Exam Tier"
        value="WJEC GCSE"
        onClick={() => alert('Tier selection coming soon')}
      />
      <SettingsRow
        icon="✉️"
        label="Email"
        value="(not set)"
        onClick={() => alert('Email linking coming soon')}
      />

      <SectionTitle>Preferences</SectionTitle>
      <SettingsRow
        icon="⏰"
        label="Daily Reminder"
        value={
          <input
            type="time"
            value={prefs.reminderTime || '18:00'}
            onChange={(e) => onUpdatePrefs({ reminderTime: e.target.value })}
            style={{
              background: 'rgba(15,23,42,0.9)',
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.45)',
              color: TEXT_PRIMARY,
              padding: '4px 8px',
              fontSize: 13,
            }}
          />
        }
      />
      <SettingsRow
        icon="🔔"
        label="Push Notifications"
        value={
          <Toggle
            checked={prefs.push}
            onChange={(v) => onUpdatePrefs({ push: v })}
          />
        }
      />
      <SettingsRow
        icon="🎧"
        label="Haptic Feedback"
        value={
          <Toggle
            checked={prefs.haptic}
            onChange={(v) => onUpdatePrefs({ haptic: v })}
          />
        }
      />

      <SectionTitle>Content & data</SectionTitle>
      <SettingsRow icon="📦" label="Manage Modules" value="Coming soon" />
      <SettingsRow
        icon="🧹"
        label="Clear Local Data"
        value=""
        onClick={() => {
          if (window.confirm('Clear all saved progress on this device?')) {
            localStorage.removeItem(LS_KEY);
            window.location.reload();
          }
        }}
      />

      <SectionTitle>Support</SectionTitle>
      <SettingsRow
        icon="❓"
        label="Help Center"
        value="(link)"
        onClick={() => alert('Help docs coming soon')}
      />
      <SettingsRow
        icon="⚙️"
        label="Report a Bug"
        value=""
        onClick={() => alert('Bug report coming soon')}
      />

      <div style={{ marginTop: 18 }}>
        <button
          onClick={() => onGo('landing')}
          style={{
            width: '100%',
            padding: 12,
            borderRadius: 999,
            background: 'transparent',
            border: '1px solid rgba(239,68,68,0.6)',
            color: '#fca5a5',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Log Out (local only)
        </button>
      </div>

      <div
        style={{
          marginTop: 12,
          color: TEXT_MUTED,
          fontSize: 11,
          textAlign: 'center',
        }}
      >
        WJEC Design Revise v0.1 (Prototype)
      </div>
    </Card>
  );
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        marginTop: 18,
        marginBottom: 6,
        color: TEXT_MUTED,
        fontSize: 11,
        letterSpacing: 1,
        textTransform: 'uppercase',
        fontWeight: 900,
      }}
    >
      {children}
    </div>
  );
}

function SettingsRow({ icon, label, value, onClick }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      style={{
        padding: 12,
        borderRadius: 14,
        background: 'rgba(2,6,23,0.75)',
        border: '1px solid rgba(15,23,42,0.9)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 12,
          background: 'rgba(30,64,175,0.4)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: TEXT_PRIMARY, fontWeight: 900 }}>{label}</div>
      </div>
      {typeof value === 'string' ? (
        <div style={{ color: TEXT_SECONDARY, fontSize: 13 }}>{value}</div>
      ) : (
        value
      )}
      {clickable && <div style={{ color: TEXT_MUTED }}>›</div>}
    </div>
  );
}
/* ----------------- REVISION HUB PAGE ----------------- */

function RevisionPage({ onGo }) {
  return (
    <Card title="Revision Hub">
      <div style={{ marginBottom: 18, color: TEXT_SECONDARY, lineHeight: 1.6 }}>
        Quick links to flashcards, knowledge organisers and WJEC past papers.
      </div>

      {/* Flashcards */}
      <div
        style={{
          padding: 16,
          borderRadius: 16,
          background: "rgba(2,6,23,0.55)",
          border: "1px solid rgba(148,163,184,0.22)",
          marginBottom: 14,
          cursor: "pointer",
        }}
        onClick={() => onGo("flashcards")}
      >
        <div style={{ fontSize: 18, fontWeight: 950, marginBottom: 4 }}>📘 Flashcards</div>
        <div style={{ color: TEXT_SECONDARY, fontSize: 13 }}>
          Endless practice using AI-generated Q&A based on your notes.
        </div>
      </div>

      {/* Knowledge organisers */}
      <div
        style={{
          padding: 16,
          borderRadius: 16,
          background: "rgba(2,6,23,0.55)",
          border: "1px solid rgba(148,163,184,0.22)",
          marginBottom: 14,
          cursor: "pointer",
        }}
        onClick={() => onGo("ko")}
      >
        <div style={{ fontSize: 18, fontWeight: 950, marginBottom: 4 }}>📄 Knowledge Organisers</div>
        <div style={{ color: TEXT_SECONDARY, fontSize: 13 }}>
          Open or download the official knowledge organisers for each unit.
        </div>
      </div>

      {/* WJEC past papers */}
      <div
        style={{
          padding: 16,
          borderRadius: 16,
          background: "rgba(2,6,23,0.55)",
          border: "1px solid rgba(148,163,184,0.22)",
          cursor: "pointer",
        }}
        onClick={() =>
          window.open(
            "https://www.wjec.co.uk/qualifications/design-and-technology-gcse/#tab_pastpapers",
            "_blank"
          )
        }
      >
        <div style={{ fontSize: 18, fontWeight: 950, marginBottom: 4 }}>📚 WJEC Past Papers</div>
        <div style={{ color: TEXT_SECONDARY, fontSize: 13 }}>
          Go straight to official WJEC GCSE Product Design past papers and mark schemes.
        </div>
      </div>
    </Card>
  );
}

/* ----------------- FLASHCARDS PAGE (AI + animation) ----------------- */

function FlashcardsPage({ selectedTopic, onGo }) {
  const [card, setCard] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const topicMeta = TOPIC_CATALOG.find((t) => t.id === selectedTopic) || {
    label: selectedTopic,
  };

  async function loadNewCard() {
    setLoading(true);
    setError("");
    setFlipped(false);

    try {
      const res = await fetch(FLASHCARDS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: selectedTopic,
          topicLabel: topicMeta.label,
        }),
      });

      if (!res.ok) {
        throw new Error(`Flashcard endpoint error: ${res.status}`);
      }

      const data = await res.json();
      const front = data.front || data.question;
      const back = data.back || data.answer;

      if (!front || !back) {
        throw new Error("Flashcard response missing front/back text");
      }

      setCard({ front, back });
    } catch (e) {
      console.error(e);
      const pool = FALLBACK_FLASHCARDS[selectedTopic] || FALLBACK_FLASHCARDS.default;
      const random = pool[Math.floor(Math.random() * pool.length)];
      setCard(random);
      setError(
        "Using built-in flashcards because the AI flashcard service isn’t available right now."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNewCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTopic]);

  const cardInnerStyle = {
    position: "relative",
    width: "100%",
    height: "100%",
    transformStyle: "preserve-3d",
    transition: "transform 0.35s ease",
    transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
  };

  const faceStyle = {
    position: "absolute",
    inset: 0,
    backfaceVisibility: "hidden",
    borderRadius: 18,
    padding: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    lineHeight: 1.6,
  };

  return (
    <Card title="Flashcards">
      <div style={{ marginBottom: 10, color: TEXT_SECONDARY, fontSize: 13 }}>
        Topic: <strong style={{ color: TEXT_PRIMARY }}>{topicMeta.label}</strong>
      </div>

      <div
        style={{
          position: "relative",
          height: 190,
          marginBottom: 14,
          perspective: 1000,
        }}
      >
        <div style={cardInnerStyle} onClick={() => !loading && setFlipped((f) => !f)}>
          {/* FRONT */}
          <div
            style={{
              ...faceStyle,
              background: "radial-gradient(circle at top, #1d4ed8, #020617)",
              border: "1px solid rgba(148,163,184,0.4)",
              color: TEXT_PRIMARY,
            }}
          >
            <div>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: TEXT_MUTED }}>
                Question
              </div>
              <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>
                {card ? card.front : "Loading…"}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: TEXT_MUTED }}>(tap to flip)</div>
            </div>
          </div>

{/* BACK */}
<div
  style={{
    ...faceStyle,
    background: "radial-gradient(circle at top, #0f172a, #020617)",
    border: "1px solid rgba(148,163,184,0.4)",
    color: TEXT_PRIMARY,
    transform: "rotateY(180deg)",

    // ✅ new (scrollable back)
    display: "block",
    padding: 18,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
  }}
>
  <div>
    <div
      style={{
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 1,
        color: TEXT_MUTED,
        textAlign: "center",
      }}
    >
      Answer
    </div>

    <div
      style={{
        marginTop: 10,
        fontSize: 15,
        fontWeight: 850,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        textAlign: "center",
      }}
    >
      {card ? card.back : "Loading…"}
    </div>

    <div
      style={{
        marginTop: 10,
        fontSize: 12,
        color: TEXT_MUTED,
        textAlign: "center",
      }}
    >
      (tap to flip back)
    </div>
  </div>
</div>

        </div>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 10,
            padding: 10,
            borderRadius: 12,
            background: "rgba(15,23,42,0.9)",
            border: "1px solid rgba(148,163,184,0.35)",
            color: TEXT_SECONDARY,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Button onClick={loadNewCard} disabled={loading}>
          {loading ? "Loading…" : "New Card"}
        </Button>
        <Button variant="ghost" onClick={() => onGo("revision")}>
          Back to Revision
        </Button>
      </div>

      <div style={{ marginTop: 10, color: TEXT_MUTED, fontSize: 11 }}>
        Tip: Use this for quick retrieval practice – flip, say the answer out loud, then check.
      </div>
    </Card>
  );
}

/* ----------------- KNOWLEDGE ORGANISERS PAGE ----------------- */

function KnowledgeOrganisersPage({ onGo }) {
  // Replace these URLs with your real KO links (SharePoint, OneDrive, etc.)
  const organisers = [
    {
      id: "ko-materials",
      name: "Unit 1 – Materials & Properties KO",
      url: "https://example.com/materials_ko.pdf",
    },
    {
      id: "ko-processes",
      name: "Unit 1 – Processes KO",
      url: "https://example.com/processes_ko.pdf",
    },
    {
      id: "ko-exam",
      name: "Unit 1 – Exam Technique KO",
      url: "https://example.com/exam_technique_ko.pdf",
    },
  ];

  return (
    <Card title="Knowledge Organisers">
      <div style={{ marginBottom: 12, color: TEXT_SECONDARY, fontSize: 13, lineHeight: 1.6 }}>
        Tap an organiser to open it in a new tab. You can download or print them for offline revision.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {organisers.map((ko) => (
          <div
            key={ko.id}
            onClick={() => window.open(ko.url, "_blank")}
            style={{
              padding: 14,
              borderRadius: 16,
              background: "rgba(2,6,23,0.75)",
              border: "1px solid rgba(148,163,184,0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontWeight: 950, marginBottom: 3 }}>📄 {ko.name}</div>
              <div style={{ color: TEXT_MUTED, fontSize: 12 }}>Tap to open</div>
            </div>
            <div style={{ color: TEXT_MUTED }}>›</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <Button variant="ghost" onClick={() => onGo("revision")}>
          Back to Revision
        </Button>
      </div>
    </Card>
  );
}
