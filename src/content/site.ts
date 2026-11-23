/**
 * All portfolio copy lives here. Both versions (A: dark observatory, B: editorial colour) render from it.
 *
 * Public-site figures policy: internal Even business figures are rounded (about 38% of ~800 patients,
 * a few hundred patients a month); outcome numbers stay exact (7%, 55% → 72%, 153 metrics, 0.14%,
 * every Pixis and Noesys number). The B2B "60%+ engaged" story was removed on request; don't add it back.
 */

export type Chip = { text: string; kind: 'metric' | 'def' };

export type Item = {
  id: string;
  title: string;
  body: string;
  /** Chips shown on the cards in version A. Metrics are highlighted, definitions are outlined. */
  chips?: Chip[];
  /** Short label shown at the end of a project row in version B. */
  label?: string;
};

export type Block = { id: string; n: '01' | '02' | '03'; title: string; items: Item[] };

export type CompanyId = 'even' | 'pixis' | 'noesys';

export type Company = {
  id: CompanyId;
  name: string;
  /** The name broken into lines for the big display headings. */
  nameLines: string[];
  role: string;
  period: string;
  domain?: string;
  summary: string;
  blocks: [Block, Block, Block];
};

const metric = (text: string): Chip => ({ text, kind: 'metric' });
const def = (text: string): Chip => ({ text, kind: 'def' });

export const person = {
  name: 'Ankit Maurya',
  title: 'Product Analyst',
  /** The line under the name on the résumé. */
  titleLine: 'Product Analyst · Product Management',
  company: 'Even Healthcare',
  location: 'Bangalore, India',
  city: 'Bangalore',
  email: 'ankitm.nitsri@gmail.com',
  linkedin: 'https://www.linkedin.com/in/ankit-maurya-nitsri/',
  /** Public Google Drive file. The `uc?export=download` form downloads it straight away instead of opening Drive. */
  resumeUrl: 'https://drive.google.com/uc?export=download&id=1WS3cRLgTH7K34NNZDKoVaclgHL8ZwA5M',
  education: 'B.Tech, National Institute of Technology Srinagar · 2017–2021',
  educationShort: 'B.Tech, NIT Srinagar · 2017–2021',
  headline: 'I turn data into product decisions.',
  skillsLine: 'SQL · Python · Experimentation',
  description:
    'Ankit Maurya is a Product Analyst at Even Healthcare in Bangalore with 4+ years turning data into product decisions: defining metrics, sizing opportunities and shipping tools teams use.',
} as const;

export const companies: Company[] = [
  {
    id: 'even',
    name: 'Even Healthcare',
    nameLines: ['Even', 'Healthcare'],
    role: 'Product Analyst',
    period: 'Mar 2025 – now',
    domain: 'Healthtech',
    summary: 'Product, clinical and insurance data, from launch tracking to the economics of an insurer partnership.',
    blocks: [
      {
        id: 'even-1',
        n: '01',
        title: 'Product & strategy',
        items: [
          {
            id: 'even-promise',
            title: 'Even Promise launch tracking',
            body: 'Even Promise is a doctor’s recorded outcome and recovery promise for a surgery patient. I set up its launch tracking, linking prescriptions, promises and surgery leads to measure offer rate and conversion.',
            chips: [def('offer rate'), def('conversion')],
            label: 'offer rate · conversion',
          },
          {
            id: 'even-infinite-metrics',
            title: 'Even Infinite success metrics',
            body: 'Defined what success means for Even Infinite: a five-stage funnel, a 48-working-hour review SLA and 90-day pass utilization. Holder-level utilization shipped first; family rollups wait until the data can support them.',
            chips: [def('5-stage funnel'), def('48 h review SLA'), def('90-day utilization')],
            label: '5-stage funnel',
          },
          {
            id: 'data-accuracy',
            title: 'Data accuracy initiative',
            body: 'A company-wide push for numbers people can trust. Teams register the dashboards they rely on, and the metrics behind them are audited in priority order, hospital metrics first.',
            chips: [metric('153 metrics audited')],
            label: '153 metrics audited',
          },
          {
            id: 'retention-drivers',
            title: 'Retention drivers',
            body: 'Worked with PMs to identify what drives retention, contributing to an uplift in Q3 2025.',
            chips: [metric('+7% retention · Q3 2025')],
            label: '+7% · Q3 2025',
          },
        ],
      },
      {
        id: 'even-2',
        n: '02',
        title: 'Analytics & experimentation',
        items: [
          {
            id: 'surgery-conversion',
            title: 'Surgery conversion',
            body: 'Sized the opportunity: about 38% of ~800 patients advised surgery were admitted within 180 days. Then designed a proactive-outreach A/B test, with power analysis showing ~8 points as the smallest lift detectable at a few hundred patients a month.',
            chips: [metric('~38% admitted in 180 days'), metric('~8-pt detectable lift')],
            label: '~38% in 180 days',
          },
          {
            id: 'clevertap-revamp',
            title: 'CleverTap analytics revamp',
            body: 'Led the revamp of the event taxonomy so user journeys can be tracked end to end.',
            chips: [metric('55% → 72% journey tracking')],
            label: '55% → 72% tracking',
          },
        ],
      },
      {
        id: 'even-3',
        n: '03',
        title: 'Business & data products',
        items: [
          {
            id: 'even-infinite-app',
            title: 'Even Infinite analytics app',
            body: 'Built a nine-page analytics app end to end: Next.js on Cloud Run with Workspace sign-in. Every metric definition stays in Metabase, so a number changes in one place.',
            chips: [def('9 pages'), def('Next.js'), def('Cloud Run'), def('Metabase')],
            label: '9 pages',
          },
          {
            id: 'insurer-economics',
            title: 'Insurer partnership economics',
            body: 'Modelled earned premium, GWP, claim ratio and payout under the insurer’s method and under Even’s own, then reconciled the model to the premium register.',
            chips: [metric('within 0.14% of the register')],
            label: 'within 0.14%',
          },
          {
            id: 'investor-metrics',
            title: 'Investor metrics',
            body: 'Built the metrics behind one investor question, whether engagement pays off: primary-care cost per engaged member, and IPD spend for engaged vs non-engaged accounts.',
            chips: [def('cost per engaged member'), def('IPD spend')],
            label: 'engaged vs not',
          },
        ],
      },
    ],
  },
  {
    id: 'pixis',
    name: 'Pixis',
    nameLines: ['Pixis'],
    role: 'Product Analyst',
    period: 'Nov 2022 – Mar 2025',
    domain: 'Adtech',
    summary: 'Over two years in adtech: analysis that moved metrics, reporting at scale, and the data quality underneath both.',
    blocks: [
      {
        id: 'pixis-1',
        n: '01',
        title: 'Analysis that moved metrics',
        items: [
          {
            id: 'segment-analysis',
            title: 'Segment and GAP analysis',
            body: 'Deep analysis across 1M+ user rows that let sales target high-value cohorts.',
            chips: [metric('+23% ad spend efficiency')],
            label: '+23% ad spend efficiency',
          },
          {
            id: 'behavioural-analysis',
            title: 'Behavioural analysis',
            body: 'Analyses of user behaviour that informed feature changes.',
            chips: [metric('+20% engagement')],
            label: '+20% engagement',
          },
          {
            id: 'onboarding-redesign',
            title: 'Onboarding redesign',
            body: 'Funnel and drop-off analysis behind a redesigned onboarding flow with less friction.',
            chips: [metric('−25% drop-offs')],
            label: '−25% drop-offs',
          },
        ],
      },
      {
        id: 'pixis-2',
        n: '02',
        title: 'Reporting at scale',
        items: [
          {
            id: 'kpi-dashboards',
            title: 'KPI dashboards',
            body: 'Designed and maintained KPI dashboards for 50+ stakeholders.',
            chips: [metric('−70% manual reporting')],
            label: '−70% manual reporting',
          },
          {
            id: 'automated-reporting',
            title: 'Automated reporting',
            body: 'Automated reporting systems that took recurring work off the analytics team.',
            chips: [metric('12+ h a week saved')],
            label: '12+ h a week saved',
          },
          {
            id: 'sql-tuning',
            title: 'SQL and warehouse tuning',
            body: 'Optimized slow SQL queries and the warehouse structures behind the dashboards.',
            chips: [metric('3–4× faster loads')],
            label: '3–4× faster loads',
          },
        ],
      },
      {
        id: 'pixis-3',
        n: '03',
        title: 'Data quality & documentation',
        items: [
          {
            id: 'validation-frameworks',
            title: 'Validation frameworks',
            body: 'Data validation frameworks that improved trust in analytics.',
            chips: [metric('−40% data-quality issues')],
            label: '−40% data-quality issues',
          },
          {
            id: 'documented-pipelines',
            title: 'Documented pipelines',
            body: 'Documented every analytics pipeline and metric definition.',
            chips: [metric('−50% analyst onboarding time')],
            label: '−50% onboarding time',
          },
          {
            id: 'ingestion-prds',
            title: 'Ingestion PRDs',
            body: 'Wrote PRDs for structured pipelines that capture and store model recommendations, improving downstream reliability.',
          },
        ],
      },
    ],
  },
  {
    id: 'noesys',
    name: 'Noesys Software',
    nameLines: ['Noesys', 'Software'],
    role: 'Product Analyst',
    period: 'Jun – Nov 2022',
    summary: 'Where it started: data pipelines, sales reporting and segmentation.',
    blocks: [
      {
        id: 'noesys-1',
        n: '01',
        title: 'Data pipelines',
        items: [
          {
            id: 'etl',
            title: 'End-to-end ETL',
            body: 'Workflows that aggregate and clean large datasets.',
            chips: [metric('+30% reporting accuracy')],
            label: '+30% reporting accuracy',
          },
        ],
      },
      {
        id: 'noesys-2',
        n: '02',
        title: 'Sales reporting',
        items: [
          {
            id: 'sales-dashboards',
            title: 'Automated sales dashboards',
            body: 'Less manual reporting and a faster decision cadence.',
            chips: [metric('−50% manual workload')],
            label: '−50% manual workload',
          },
        ],
      },
      {
        id: 'noesys-3',
        n: '03',
        title: 'Segmentation & outreach',
        items: [
          {
            id: 'customer-segmentation',
            title: 'Customer segmentation',
            body: 'Segmentation models that enabled targeted marketing and contributed to a revenue increase.',
            chips: [metric('+15% revenue')],
            label: '+15% revenue',
          },
          {
            id: 'sms-dispatch',
            title: 'Automated SMS dispatch',
            body: 'Outreach that reaches customers sooner each cycle, lifting lead conversion.',
            chips: [metric('4 h faster per cycle')],
            label: '4 h faster per cycle',
          },
        ],
      },
    ],
  },
];

export const atlas = {
  name: 'Atlas',
  label: 'Side project · 2026 · Open source',
  role: 'Designed and built end to end',
  tagline: 'Publish dashboards built with Claude to your own domain, with live data, company sign-in and version history.',
  headlineLines: ['Atlas.', 'Publish what', 'Claude builds.'],
  problem:
    'Teams now build dashboards by chatting with Claude, but each one ends up as one person’s page with a frozen copy of the data. Getting it onto a real URL usually means an engineer rebuilding it by hand. With Atlas, you add it to Claude as a connector, say “publish this as sales-weekly”, and the dashboard is live on your company’s domain.',
  github: 'https://github.com/an-kitm/atlas',
  features: [
    {
      id: 'atlas-1',
      n: '01',
      title: 'Publish from Claude',
      body: 'Add Atlas to Claude as a connector, or use the CLI or the Claude Code plugin. Publishing validates the page and test-runs every query, so Claude gets precise errors to fix before anything goes live.',
      chips: ['MCP connector', 'CLI', 'Claude Code plugin'],
    },
    {
      id: 'atlas-2',
      n: '02',
      title: 'Live data, behind SSO',
      body: 'Each page declares its datasets, a Metabase question or SQL against Postgres or SQLite, and Atlas fills them on every visit, with caching. Sign-in runs through any OIDC provider, and a dashboard can be open to the whole company, limited to people or groups, or private.',
      chips: ['Metabase', 'Postgres', 'OIDC sign-in'],
    },
    {
      id: 'atlas-3',
      n: '03',
      title: 'Versioned and sandboxed',
      body: 'Every publish is an immutable version you can roll back from Claude, the CLI or the version menu. Each dashboard runs in an opaque-origin sandbox with no network access and can only read the data it declared.',
      chips: ['Rollback', 'Sandboxed frames', 'OAuth 2.1 + PKCE'],
    },
  ],
  stack: 'Built with TypeScript, Hono, Kysely, the MCP TypeScript SDK, openid-client and zod. Ships as a Docker image.',
  screenshot: {
    file: 'atlas-dashboard.jpg',
    width: 1316,
    height: 919,
    alt: 'An Atlas dashboard titled Revenue Overview: revenue, orders and average order value for the last 30 days, a daily revenue line chart, and orders and revenue by region.',
    caption: 'A dashboard served by Atlas, running on the project’s demo data.',
  },
} as const;

export const principles = [
  {
    id: 'one-definition',
    title: 'One definition, one place',
    body: 'Every metric in the Even Infinite app is defined once, in Metabase, so a number changes in one place.',
  },
  {
    id: 'ship-what-data-supports',
    title: 'Ship what the data supports',
    body: 'Holder-level utilization went out first. Family rollups wait until the data can carry them.',
  },
  {
    id: 'size-the-test',
    title: 'Size the test first',
    body: 'Before any outreach, power analysis showed ~8 points was the smallest lift a few hundred patients a month could detect.',
  },
  {
    id: 'instrument-before-launch',
    title: 'Instrument before launch',
    body: 'Even Promise launched with tracking linking prescriptions, promises and surgery leads, so offer rate and conversion could be measured from the start.',
  },
] as const;

/** Skills, grouped and worded as on the résumé. */
export const toolkit = {
  groups: [
    {
      title: 'Product',
      items: [
        'Launch metrics & KPI design',
        'Funnel & drop-off analysis',
        'A/B testing & power analysis',
        'Customer journey mapping',
        'Event instrumentation',
        'PRDs',
        'Stakeholder management',
      ],
    },
    {
      title: 'Data',
      items: [
        'Advanced SQL (PostgreSQL, MySQL)',
        'Python (Pandas, NumPy)',
        'Cohort & retention analysis',
        'Customer segmentation',
        'Statistical & predictive analysis',
        'Data pipelines & data quality',
      ],
    },
    {
      title: 'Tools',
      items: [
        'Metabase',
        'Tableau',
        'Power BI',
        'Streamlit',
        'Retool',
        'Excel',
        'Google Sheets & Apps Script',
        'Mixpanel',
        'CleverTap',
        'Amplitude',
        'Hotjar',
        'Zapier',
        'JIRA',
        'Linear',
      ],
    },
    {
      title: 'Soft skills',
      items: ['Problem solving', 'Critical thinking', 'Time management', 'Cross-functional collaboration'],
    },
  ],
  /** Prose versions used by version B. */
  analysisProse:
    'Launch metrics and KPI design, funnel and drop-off analysis, A/B testing and power analysis, customer journey mapping, event instrumentation; advanced SQL (PostgreSQL, MySQL), Python (Pandas, NumPy), cohort and retention analysis, customer segmentation, statistical and predictive analysis, data pipelines and data quality.',
  toolsProse:
    'Metabase, Tableau, Power BI, Streamlit, Retool, Excel, Google Sheets and Apps Script, Mixpanel, CleverTap, Amplitude, Hotjar, Zapier, JIRA and Linear.',
} as const;

/** Prefix a public asset or route with the site's base path (works locally and on GitHub Pages). */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}${path.replace(/^\//, '')}`;
}
