import {
  APP_PATHS,
  BCH,
  CLOSING_FACTS,
  CONTRACT_SOURCE,
  EXAMPLE_ANCHOR,
  FACT_LABELS,
  MARKETING_COPY,
  MARKETING_PATHS,
  NETWORK_WORD,
  SAMPLE_PEOPLE,
  appLink,
  type SolutionPageCopy,
} from './shared';

const MILESTONES = [
  { id: 'draft', title: 'Write the first draft', amount: '3.00', status: 'released' as const },
  { id: 'review', title: 'Review with two wallet teams', amount: '3.00', status: 'pending' as const },
  { id: 'publish', title: 'Publish the guide', amount: '3.00', status: 'pending' as const },
];

export const GRANT_RELEASE_COSIGN = "FlowGuard's server approves each release you start, and the money can only go to the project.";

export const GRANTS: SolutionPageCopy = {
  hero: {
    eyebrow: 'Grants',
    headline: 'Fund a project',
    accent: 'in milestones.',
    lead: 'Lock the full grant up front and release each part when the work is done.',
    primary: { label: MARKETING_COPY.openApp, href: appLink(APP_PATHS.createGrant) },
    secondary: { label: MARKETING_COPY.seeExample, href: EXAMPLE_ANCHOR },
    note: MARKETING_COPY.whatYouNeed,
    visual: { kind: 'milestones', list: { asset: BCH, milestones: MILESTONES } },
  },
  steps: [
    { title: 'Split the work', body: 'Name each milestone. Every milestone pays the same amount, set when you create the grant.' },
    {
      title: 'Lock the grant',
      body: 'Approve one transaction in your wallet to lock the full amount in a contract. The project can see the money is there.',
    },
    {
      title: 'Release each milestone',
      body: "When a milestone is done, you release its amount to the project's wallet.",
    },
  ],
  example: {
    plan: {
      recipient: SAMPLE_PEOPLE.ade,
      schedule: {
        kind: 'milestones',
        asset: BCH,
        milestones: MILESTONES.map(({ title, amount }) => ({ title, amount })),
      },
    },
  },
  decide: [
    { label: 'Project', value: 'The wallet address that receives each milestone.' },
    { label: 'Milestones', value: 'What each piece of work is. Each pays the same amount.' },
    { label: 'Amount', value: 'BCH or one token, locked in full when you fund the grant.' },
    { label: 'Cancelling', value: 'You, if you allow it when you create the grant. Milestones not released yet come back to your wallet.' },
  ],
  facts: {
    eyebrow: 'Grants',
    network: NETWORK_WORD,
    rows: [
      { label: FACT_LABELS.whoCanMove, value: `You release each milestone to the project. ${GRANT_RELEASE_COSIGN}` },
      { label: FACT_LABELS.ifCancelled, value: 'Milestones already released stay with the project. The rest comes back to your wallet.' },
      {
        label: FACT_LABELS.ifFlowGuardGoes,
        value: "Releases wait until FlowGuard's server is back. The money stays in the contract until then.",
      },
    ],
  },
  source: CONTRACT_SOURCE.distribution,
  goodToKnow: [
    'The project doesn\'t claim. You release each milestone, and it arrives in their wallet.',
    GRANT_RELEASE_COSIGN,
    'The milestones and the amount each one pays are set when you create the grant.',
    'Every release is a public transaction on Bitcoin Cash.',
  ],
  faq: [
    {
      id: 'see-the-money',
      question: 'Can the project see the money is there?',
      answer: 'Yes. The full grant is locked in a contract when you fund it, and anyone can check it on Bitcoin Cash.',
    },
    {
      id: 'project-stalls',
      question: 'What if the project stalls?',
      answer: "If you allowed cancelling, cancel the grant. What's already released stays with the project, and the rest comes back to your wallet.",
    },
    {
      id: 'several-grants',
      question: 'Can I fund several projects?',
      answer: 'Yes. Create one grant for each project. They all show in your list of grants.',
    },
  ],
  closing: {
    headline: 'Fund the work',
    accent: 'as it ships.',
    lead: "Lock the grant once. Release each part when you've seen the work.",
    primary: { label: 'Create grant', href: appLink(APP_PATHS.createGrant) },
    secondary: { label: MARKETING_COPY.tryIt, href: MARKETING_PATHS.demo },
    facts: CLOSING_FACTS,
  },
};
