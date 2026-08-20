/**
 * Content for /clean-core-explained.
 *
 * Kept as data rather than markup so the page stays readable, the JSON-LD can be
 * generated from the same source as the visible text (no drift between what a
 * reader sees and what a crawler is told), and a correction only has to be made
 * once.
 *
 * The didactic shape borrows from the old instructional paperbacks — short
 * chapters, margin notes, everything defined before it is used. The name and the
 * yellow-and-black trade dress do not: "For Dummies" is a registered trademark of
 * John Wiley & Sons, who publish SAP titles in that series themselves, so the
 * likelihood of confusion would be squarely in the same field.
 */

export type NoteKind = 'remember' | 'tip' | 'warning' | 'advanced' | 'jargon';

export interface Note {
  kind: NoteKind;
  title: string;
  text: string;
}

export interface Chapter {
  id: string;
  number: string;
  title: string;
  /** The one-sentence answer, before any elaboration. */
  lede: string;
  paragraphs: string[];
  notes?: Note[];
  /** Rendered as a definition list — every term introduced before it is used. */
  terms?: { term: string; definition: string }[];
  table?: { caption: string; head: string[]; rows: string[][] };
}

export interface Part {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  chapters: Chapter[];
}

export const NOTE_LABELS: Record<NoteKind, string> = {
  remember: 'Remember this',
  tip: 'In practice',
  warning: 'Watch out',
  advanced: 'For the advanced reader',
  jargon: 'Jargon, decoded',
};

export const GUIDE_PARTS: Part[] = [
  {
    id: 'basics',
    eyebrow: 'Part 1',
    title: 'The idea, from scratch',
    intro:
      'No SAP knowledge assumed. If you already know what a modification is, skip to Part 3 — nothing here will surprise you.',
    chapters: [
      {
        id: 'what-is-the-core',
        number: '1.1',
        title: 'What is "the core", and why does it need to be clean?',
        lede:
          'The core is the standard SAP software your company runs. It is clean when nobody has altered it — only extended it from the outside.',
        paragraphs: [
          'SAP ships a large, standard business system. Every customer gets the same one. Almost no company can use it entirely as delivered, because every company does something slightly differently — a discount rule, an approval step, a report the auditors want in a particular shape.',
          'For thirty years the obvious answer was to change the system itself. You could open SAP\'s own programs and edit them, or hook your own code directly into them. It worked, it was fast, and it is the reason a great many SAP systems today contain tens of thousands of pieces of custom code.',
          'The bill arrives at upgrade time. When SAP ships a new version, it replaces its own programs — and every place where somebody edited them has to be found, understood, and reconciled by hand. A system with heavy modifications can turn a routine update into a project lasting months.',
          '"Clean Core" is the discipline of getting the benefit of customisation without paying that bill: leave the standard software untouched, and put your own logic beside it, connected through interfaces SAP has promised to keep stable.',
        ],
        notes: [
          {
            kind: 'remember',
            title: 'The whole idea in one sentence',
            text:
              'Do not change the standard. Extend it from outside, through doors SAP has promised not to move.',
          },
        ],
      },
      {
        id: 'custom-code',
        number: '1.2',
        title: 'What is custom code, and why is there so much of it?',
        lede:
          'Custom code is the software your company wrote itself inside SAP, usually in a language called ABAP. Most of it exists for good reasons.',
        paragraphs: [
          'ABAP is SAP\'s own programming language. Programs written in it live inside the SAP system rather than on a separate server, which historically made them fast, convenient, and dangerously easy to entangle with SAP\'s own code.',
          'Custom objects are conventionally named with a leading Z or Y — so a report called ZFI_INVOICE_CHECK is yours, and one called RFBILA00 is SAP\'s. That naming convention is the single most useful thing to know when you first look at an SAP system.',
          'It is worth being fair to the people who wrote all this. Custom code is usually not carelessness; it is the accumulated record of decisions the business needed and the standard did not offer at the time. The problem is not that it exists. The problem is where it sits and what it touches.',
        ],
        terms: [
          {
            term: 'ABAP',
            definition:
              'Advanced Business Application Programming — SAP\'s programming language, running inside the SAP system itself.',
          },
          {
            term: 'Z-object / Y-object',
            definition:
              'A custom object. The leading Z or Y is a naming convention reserved for customers, so SAP\'s own updates never collide with it.',
          },
          {
            term: 'S/4HANA',
            definition:
              'SAP\'s current generation of business software. The move to it is what forces most organisations to confront their custom code.',
          },
        ],
      },
      {
        id: 'what-goes-wrong',
        number: '1.3',
        title: 'What actually goes wrong?',
        lede:
          'Three things: upgrades become expensive, cloud migration becomes impossible, and nobody can say which risk is real.',
        paragraphs: [
          'The first is upgrade cost, described above. The second is sharper: SAP\'s cloud offerings simply do not permit the old techniques. Code that reads a standard table directly, writes files to the application server, or calls an unpublished function will not run there. It is not discouraged — it does not compile.',
          'The third problem is the quiet one. A system with 40,000 custom objects contains some that are business-critical, some that nobody has executed since 2014, and no reliable way to tell them apart without looking. Programmes stall here, not on the technology.',
        ],
        notes: [
          {
            kind: 'warning',
            title: 'The trap in the middle',
            text:
              'Most modernisation projects do not fail on the difficult objects. They fail on not knowing which objects are difficult — so effort is spread evenly across code that deserves very different treatment.',
          },
        ],
      },
    ],
  },
  {
    id: 'vocabulary',
    eyebrow: 'Part 2',
    title: 'The vocabulary you actually need',
    intro:
      'Clean Core discussions are dense with terminology, and most of it is simpler than it sounds. These are the terms you will meet in the first hour.',
    chapters: [
      {
        id: 'core-terms',
        number: '2.1',
        title: 'Twelve terms, plainly',
        lede:
          'Learn these and most SAP architecture conversations become followable.',
        paragraphs: [],
        terms: [
          {
            term: 'Released API',
            definition:
              'An interface SAP has formally promised to keep stable, with a documented contract and a deprecation process. Building on one is what makes an extension upgrade-safe. Building on anything else is a private arrangement SAP never agreed to.',
          },
          {
            term: 'Extensibility',
            definition:
              'The supported ways of adding your own behaviour without modifying the standard. SAP distinguishes several, described in Part 3.',
          },
          {
            term: 'In-app extensibility',
            definition:
              'Your code runs inside the SAP system, but only through released interfaces. Close to the data, tightly governed.',
          },
          {
            term: 'Side-by-side extensibility',
            definition:
              'Your code runs outside the SAP system, on a separate platform, and talks to SAP over published interfaces. More freedom, more moving parts.',
          },
          {
            term: 'SAP BTP',
            definition:
              'Business Technology Platform — SAP\'s cloud platform where side-by-side extensions live. Think of it as the sanctioned place to put things that no longer belong inside the ERP.',
          },
          {
            term: 'ABAP Cloud',
            definition:
              'The restricted ABAP dialect for the cloud era. It permits only released interfaces, which is precisely why code written for it survives upgrades.',
          },
          {
            term: 'RAP',
            definition:
              'ABAP RESTful Application Programming Model — the modern way to build an application in ABAP Cloud. Used for in-app extensions.',
          },
          {
            term: 'CAP',
            definition:
              'Cloud Application Programming Model — SAP\'s framework for building services on BTP, typically in Node.js or Java. Used for side-by-side extensions.',
          },
          {
            term: 'Modification',
            definition:
              'A change to SAP\'s own code. The thing Clean Core exists to eliminate. Distinct from an extension, which leaves the standard intact.',
          },
          {
            term: 'Technical debt',
            definition:
              'The future cost of a decision that was convenient at the time. In this context: every shortcut that has to be unwound before a cloud move.',
          },
          {
            term: 'abapGit',
            definition:
              'An open-source tool for moving ABAP code in and out of Git. Relevant because it is how generated code gets into a real system for review.',
          },
          {
            term: 'ADT',
            definition:
              'ABAP Development Tools — the Eclipse-based environment where modern ABAP is actually written and tested.',
          },
        ],
        notes: [
          {
            kind: 'jargon',
            title: '"Released" is the load-bearing word',
            text:
              'If you remember one term from this page, make it this one. Almost every Clean Core rule reduces to: are you using something SAP released, or something you found?',
          },
        ],
      },
    ],
  },
  {
    id: 'dimensions',
    eyebrow: 'Part 3',
    title: 'The five dimensions',
    intro:
      'Clean Core is not only about code. SAP frames it across several dimensions, and a programme that addresses only the code dimension tends to stall on one of the others.',
    chapters: [
      {
        id: 'five-dimensions',
        number: '3.1',
        title: 'Where "clean" applies',
        lede:
          'Software stack, extensions, data, integrations and processes — each can be clean or dirty independently.',
        paragraphs: [
          'It is tempting to treat Clean Core as a code-cleanup exercise, because code is visible and countable. In practice a programme is only as clean as its weakest dimension: pristine extensions built on a tangle of point-to-point integrations still block an upgrade.',
        ],
        table: {
          caption: 'The five dimensions, and what "clean" means in each',
          head: ['Dimension', 'Clean means', 'Typical smell'],
          rows: [
            ['Software stack', 'Current release, no modifications to SAP code', 'Years behind, upgrade repeatedly deferred'],
            ['Extensions', 'Built only on released interfaces', 'Direct table access, unpublished function calls'],
            ['Data', 'Governed, deduplicated, with clear ownership', 'Custom tables shadowing standard ones'],
            ['Integrations', 'Via published APIs and an integration layer', 'Point-to-point file drops and database links'],
            ['Processes', 'Close to the standard, deviations justified', 'Every process customised, nobody remembers why'],
          ],
        },
        notes: [
          {
            kind: 'tip',
            title: 'Where to start',
            text:
              'Extensions, almost always. They are the dimension you can measure objectively, and progress there produces evidence that funds the rest.',
          },
        ],
      },
    ],
  },
  {
    id: 'decision',
    eyebrow: 'Part 4',
    title: 'The decision that matters: in-app or side-by-side',
    intro:
      'For any given piece of custom code there is one architectural question worth arguing about. This part is for practitioners.',
    chapters: [
      {
        id: 'rap-vs-cap',
        number: '4.1',
        title: 'RAP or CAP — how to actually decide',
        lede:
          'Data gravity and transactional coupling pull in-app; independent lifecycle and non-SAP concerns push side-by-side.',
        paragraphs: [
          'The choice is not a matter of taste, and it is not "cloud is modern so everything goes to BTP". It follows from what the object does.',
          'Logic that reads and writes SAP business data in the same transaction — a validation on a sales order, a derivation during posting — belongs in-app, as RAP. Moving it outside means network round trips inside a transaction boundary, which is both slow and fragile.',
          'Logic that serves a different audience, changes on a different schedule, or needs libraries the ABAP stack does not have — a partner portal, a machine-learning scoring service, a mobile back end — belongs side-by-side, as CAP on BTP.',
          'Between those poles sits a large grey zone, and this is where honest architecture happens. The tie-breaker worth applying: if the extension must be deployed in lockstep with the ERP to remain correct, it is in-app. If it can be released on its own cadence, it is side-by-side.',
        ],
        table: {
          caption: 'A decision aid, not a rule book',
          head: ['Signal', 'Points to'],
          rows: [
            ['Reads and writes SAP tables in one transaction', 'In-app (RAP)'],
            ['Needs sub-second access to business data', 'In-app (RAP)'],
            ['Extends a standard SAP business object', 'In-app (RAP)'],
            ['Serves non-SAP users or systems', 'Side-by-side (CAP)'],
            ['Has its own release cycle', 'Side-by-side (CAP)'],
            ['Needs libraries or runtimes ABAP does not offer', 'Side-by-side (CAP)'],
            ['Would put unpredictable load on the ERP', 'Side-by-side (CAP)'],
          ],
        },
        notes: [
          {
            kind: 'advanced',
            title: 'The successor question',
            text:
              'Before either route, ask whether the custom object should exist at all. A meaningful share of legacy code duplicates functionality the standard has since acquired. Retiring an object is cheaper than modernising it, and the analysis effort is the same.',
          },
        ],
      },
      {
        id: 'hard-cases',
        number: '4.2',
        title: 'The hard cases nobody warns you about',
        lede:
          'Some techniques have no cloud equivalent at all. Recognising them early saves the most time.',
        paragraphs: [
          'A handful of patterns are not merely discouraged in the cloud — they have no replacement, and code relying on them needs a rethink rather than a translation.',
        ],
        table: {
          caption: 'Patterns with no direct cloud successor',
          head: ['Pattern', 'Why it breaks', 'What replaces it'],
          rows: [
            ['Application-server file access', 'No file system in ABAP Cloud', 'Object storage or an integration service'],
            ['Direct writes to standard tables', 'Bypasses business logic and validation', 'Released APIs for the business object'],
            ['Batch input / call transaction', 'Screen scraping is not available', 'Released APIs or mass-change services'],
            ['Dynamic program generation', 'Not permitted', 'Rules in configuration, not in generated code'],
            ['Unpublished RFC calls', 'The contract was never guaranteed', 'A released equivalent, or a new one'],
          ],
        },
        notes: [
          {
            kind: 'warning',
            title: 'Estimate these separately',
            text:
              'These objects distort averages badly. An estimate that treats a file-writing extractor as equivalent to a straightforward report will be wrong by an order of magnitude on that one item.',
          },
        ],
      },
    ],
  },

  {
    id: 'grades',
    eyebrow: 'Part 5',
    title: 'Grading your code: the A–D model',
    intro:
      'Clean Core guidance has moved on from a binary "clean or not" to a four-grade classification. This is the part that turns an opinion into a work plan — and it is the model we walk through in detail in our SAP Community write-up.',
    chapters: [
      {
        id: 'a-to-d',
        number: '5.1',
        title: 'Four grades, and what each one costs you',
        lede:
          'Every custom object lands in one of four grades, and the grade tells you what to do with it.',
        paragraphs: [
          'The grades describe what an object depends on, not how well it is written. A beautifully engineered report that writes directly to a standard table is still grade D, because the dependency is what breaks in the cloud — not the code quality.',
          'This matters for estimating. Grades A and B need review; grade C needs an interface; grade D needs a decision about whether the object should exist at all. Treating them as one bucket is how modernisation budgets go wrong.',
        ],
        table: {
          caption: 'The four grades and the work each implies',
          head: ['Grade', 'What it depends on', 'What to do', 'Effort'],
          rows: [
            ['A', 'Released SAP APIs and extension points', 'Nothing — this is where you want to be. Build here.', 'None'],
            ['B', 'Classic SAP APIs, still SAP-recommended', 'Keep, and plan for released successors over time.', 'Low'],
            ['C', 'Internal SAP APIs — conditionally clean', 'Wrap behind a clean interface, verify each release.', 'Medium'],
            ['D', 'Direct writes to standard tables, unreleased dependencies, dynpro, kernel calls', 'Replace or re-architect. These are the upgrade blockers.', 'High'],
          ],
        },
        notes: [
          {
            kind: 'tip',
            title: 'The working sequence',
            text:
              'Identify each object → look it up in the SAP Cloudification Repository → assign a grade → decide the remediation (map to a released API or CDS view, wrap it, or re-architect) → confirm with SAP ADT and the ABAP Test Cockpit.',
          },
          {
            kind: 'advanced',
            title: 'The grades line up with ATC priorities',
            text:
              'They are not a parallel universe. The A–D grades map onto ABAP Test Cockpit priorities, so a classification exercise and an ATC run should broadly agree — and where they disagree, that disagreement is itself worth looking at.',
          },
          {
            kind: 'warning',
            title: 'Our grade is an estimate, not a verdict',
            text:
              'The A–D grade Clean-Core.io produces is an experimental preview estimate — a fast orientation aid, not an authoritative SAP ATC classification. Always confirm with SAP ADT and ATC for your specific target release before acting on it.',
          },
        ],
      },
      {
        id: 'visibility',
        number: '5.2',
        title: 'You cannot clean what you cannot see',
        lede:
          'Before remediation comes measurement. Without numbers per object, a Clean Core programme has no way to show progress or defend a decision.',
        paragraphs: [
          'The extensibility dimension is the one you can actually measure, which is why it is the sensible place to start. The useful figures are not "how many objects do we have" but questions with consequences: how many are grade D, how many objects are touched by the next upgrade, how many were executed at all in the last year.',
          'That last one deserves emphasis. A meaningful share of any large custom-code estate is dead — written for a process that no longer exists, kept because deleting felt riskier than ignoring. Usage data turns that from a suspicion into a number, and retiring an object is always cheaper than modernising it.',
          'Once the figures exist per object, progress becomes reportable: grade D count going down over quarters is a sentence a steering committee can act on, in a way that "the team is working on Clean Core" is not.',
        ],
        notes: [
          {
            kind: 'remember',
            title: 'Three numbers worth tracking',
            text:
              'Objects by grade (is the D pile shrinking), objects never executed (what can simply be retired), and objects on the upgrade path (what forces a decision this year).',
          },
        ],
      },
    ],
  },
];

/** Questions worth answering directly — also emitted as FAQ structured data. */
export const GUIDE_FAQ: { question: string; answer: string }[] = [
  {
    question: 'What does SAP Clean Core mean?',
    answer:
      'Clean Core means running SAP standard software without modifying it, and adding your own behaviour only through interfaces SAP has formally released and promised to keep stable. The purpose is that upgrades stay routine instead of becoming projects.',
  },
  {
    question: 'Why is Clean Core suddenly important?',
    answer:
      'Because SAP\'s cloud offerings do not permit the older techniques. Code that reads standard tables directly, writes to the application server, or calls unpublished functions does not run there — so the move to S/4HANA in the cloud forces the question that on-premise systems allowed organisations to defer.',
  },
  {
    question: 'What is the difference between in-app and side-by-side extensibility?',
    answer:
      'In-app extensions run inside the SAP system using ABAP Cloud and RAP, and suit logic that is transactionally coupled to SAP data. Side-by-side extensions run on SAP BTP, typically as CAP services, and suit logic with its own release cycle or a non-SAP audience.',
  },
  {
    question: 'Do I have to rewrite all my custom code?',
    answer:
      'No. A meaningful share of legacy custom code can be retired because the standard has since acquired the functionality, and much of the rest needs adjustment rather than rewriting. The expensive mistake is treating every object as equivalent instead of classifying them first.',
  },
  {
    question: 'How do I know which of my objects are the problem?',
    answer:
      'By analysing them against the Clean Core criteria — which interfaces they use, how they touch data, and whether the patterns they rely on exist in the cloud at all. That analysis is what Clean-Core.io automates, producing evidence per object rather than an overall impression.',
  },
  {
    question: 'Is Clean-Core.io free?',
    answer:
      'Yes. It is a free community project. Every account gets five transformations, and connecting your own Google Gemini API key removes the limit entirely. There is no paid tier and no locked feature.',
  },
];
