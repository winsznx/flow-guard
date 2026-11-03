import { useMemo, useState } from 'react';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Heading } from '../components/ui/Heading';
import { Plus } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { PlanSentence, type Schedule } from '../components/ui/PlanSentence';
import { RepeatableRows } from '../components/ui/RepeatableRows';
import { ScheduleTimeline } from '../components/ui/ScheduleTimeline';
import type { Asset } from '../components/ui/types';
import { SCHEDULE_CHOICE, SCHEDULE_EXAMPLES, type ScheduleChoice } from '../copy/streams';

const BCH: Asset = { kind: 'bch' };
const DAY_MS = 86_400_000;
const SATS = 100_000_000;
const EXAMPLE_TOTAL_SATS = 12 * SATS;
const EXAMPLE_TOTAL = '12';

type Block = { at: number; amount: string; state: 'later' | 'waiting' };

type Example = {
  choice: ScheduleChoice;
  template: string;
  summary: string;
  blocks: Block[];
  schedule: Schedule;
  continuous?: boolean;
};

function bch(sats: number, decimals = 8): string {
  return (Math.max(0, Math.round(sats)) / SATS).toFixed(decimals);
}

function evenBlocks(
  start: number,
  fromDay: number,
  toDay: number,
  sats: number,
  everyDays = 7
): Block[] {
  const blocks: Block[] = [];
  const span = toDay - fromDay;
  const count = Math.max(1, Math.round(span / everyDays));
  for (let index = 1; index <= count; index += 1) {
    const day = fromDay + (span * index) / count;
    blocks.push({ at: start + day * DAY_MS, amount: bch(sats / count, 2), state: 'later' });
  }
  return blocks;
}

function buildExamples(start: number): Example[] {
  const at = (day: number) => start + day * DAY_MS;
  const perPayment = EXAMPLE_TOTAL_SATS / 6;
  const waitDays = 90;
  const waitEnd = 365;
  const earnedAtWait = (EXAMPLE_TOTAL_SATS * waitDays) / waitEnd;
  const upfrontDay = 90;
  const upfrontSats = EXAMPLE_TOTAL_SATS / 4;

  return [
    {
      choice: 'once',
      template: 'step-timelock',
      summary: SCHEDULE_EXAMPLES.example('12.00 BCH', 1),
      blocks: [{ at: at(180), amount: bch(EXAMPLE_TOTAL_SATS), state: 'later' }],
      schedule: { kind: 'once', amount: EXAMPLE_TOTAL, asset: BCH, on: at(180) },
    },
    {
      choice: 'evenly',
      continuous: true,
      template: 'linear-open',
      summary: SCHEDULE_EXAMPLES.exampleEven('12.00 BCH', 180),
      blocks: evenBlocks(start, 0, 180, EXAMPLE_TOTAL_SATS),
      schedule: { kind: 'linear', total: EXAMPLE_TOTAL, asset: BCH, start, end: at(180) },
    },
    {
      choice: 'sameAmount',
      template: 'recurring-monthly',
      summary: SCHEDULE_EXAMPLES.example('12.00 BCH', 6),
      blocks: Array.from({ length: 6 }, (_, index) => ({
        at: at(30 * (index + 1)),
        amount: bch(perPayment),
        state: 'later' as const,
      })),
      schedule: {
        kind: 'recurring',
        perRelease: bch(perPayment),
        asset: BCH,
        everyDays: 30,
        count: 6,
        start: at(30),
      },
    },
    {
      choice: 'waitThenEvenly',
      continuous: true,
      template: 'linear-cliff',
      summary: SCHEDULE_EXAMPLES.exampleEven('12.00 BCH', waitEnd),
      blocks: [
        { at: start, amount: '0', state: 'waiting' },
        { at: at(waitDays), amount: bch(earnedAtWait, 2), state: 'later' },
        ...evenBlocks(start, waitDays, waitEnd, EXAMPLE_TOTAL_SATS - earnedAtWait, 14),
      ],
      schedule: {
        kind: 'linear',
        total: EXAMPLE_TOTAL,
        asset: BCH,
        start,
        end: at(waitEnd),
        waitUntil: at(waitDays),
      },
    },
    {
      choice: 'partNow',
      continuous: true,
      template: 'hybrid-upfront-linear',
      summary: SCHEDULE_EXAMPLES.exampleEven('12.00 BCH', 365),
      blocks: [
        { at: start, amount: '0', state: 'waiting' },
        { at: at(upfrontDay), amount: bch(upfrontSats), state: 'later' },
        ...evenBlocks(start, upfrontDay, 365, EXAMPLE_TOTAL_SATS - upfrontSats, 14),
      ],
      schedule: {
        kind: 'upfront',
        upfront: bch(upfrontSats),
        rest: bch(EXAMPLE_TOTAL_SATS - upfrontSats),
        asset: BCH,
        start: at(upfrontDay),
        end: at(365),
      },
    },
  ];
}

type CustomRow = { key: string; day: string; percent: string };

const STARTING_ROWS: CustomRow[] = [
  { key: 'r1', day: '90', percent: '25' },
  { key: 'r2', day: '180', percent: '25' },
  { key: 'r3', day: '360', percent: '50' },
];

function checkRows(rows: CustomRow[]): string | null {
  let previous = 0;
  for (const [index, row] of rows.entries()) {
    const day = Number(row.day);
    const percent = Number(row.percent);
    if (!Number.isFinite(day) || day <= 0) return SCHEDULE_EXAMPLES.custom.needsDay(index + 1);
    if (!Number.isFinite(percent) || percent <= 0)
      return SCHEDULE_EXAMPLES.custom.needsPercent(index + 1);
    if (index > 0 && day <= previous) return SCHEDULE_EXAMPLES.custom.needsOrder(index + 1);
    previous = day;
  }
  const sum = percentSum(rows);
  return sum === 100 ? null : SCHEDULE_EXAMPLES.custom.needsHundred(sum);
}

function percentSum(rows: CustomRow[]): number {
  return Math.round(rows.reduce((total, row) => total + (Number(row.percent) || 0), 0) * 100) / 100;
}

function ExampleCard({ example }: { example: Example }) {
  const choice = SCHEDULE_CHOICE[example.choice];
  return (
    <Card as="article">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Heading level="item">{choice.name}</Heading>
          <p className="text-body text-ink-secondary">{choice.line}</p>
        </div>
        <p className="text-small text-ink-muted">{example.summary}</p>
        {example.continuous ? (
          <p className="text-small text-ink-muted">{SCHEDULE_EXAMPLES.aboutWeekly}</p>
        ) : null}
        <ScheduleTimeline asset={BCH} blocks={example.blocks} variant="preview" continuous={example.continuous} />
        <PlanSentence
          recipient={{ address: '', name: SCHEDULE_EXAMPLES.sampleName }}
          schedule={example.schedule}
        />
        <div>
          <ButtonLink
            variant="secondary"
            size="sm"
            to={`/streams/create?template=${example.template}`}
          >
            {SCHEDULE_EXAMPLES.use}
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

function CustomCard({ start }: { start: number }) {
  const [rows, setRows] = useState<CustomRow[]>(STARTING_ROWS);
  const problem = checkRows(rows);
  const sum = percentSum(rows);
  const choice = SCHEDULE_CHOICE.custom;

  const blocks: Block[] = problem
    ? []
    : rows.map((row) => ({
        at: start + Number(row.day) * DAY_MS,
        amount: bch((EXAMPLE_TOTAL_SATS * Number(row.percent)) / 100),
        state: 'later',
      }));

  const target = problem
    ? null
    : `/streams/create?${new URLSearchParams({
        template: 'tranche-backweighted',
        duration: rows[rows.length - 1].day,
        trancheOffsets: rows.map((row) => row.day).join('|'),
        tranchePercentages: rows.map((row) => row.percent).join('|'),
      }).toString()}`;

  return (
    <Card as="article">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Heading level="item">{choice.name}</Heading>
          <p className="text-body text-ink-secondary">{choice.line}</p>
        </div>
        <RepeatableRows
          legend={SCHEDULE_EXAMPLES.custom.legend}
          rows={rows}
          onChange={setRows}
          makeRow={() => {
            const last = rows[rows.length - 1];
            return {
              key: `r${Date.now()}`,
              day: String((Number(last?.day) || 0) + 30),
              percent: '0',
            };
          }}
          min={1}
          max={8}
          addLabel={SCHEDULE_EXAMPLES.custom.add}
          rowKey={(row) => row.key}
          renderRow={(row, index, update) => (
            <>
              <Input
                label={SCHEDULE_EXAMPLES.custom.day}
                type="number"
                inputMode="numeric"
                min={1}
                value={row.day}
                onChange={(event) => update({ ...row, day: event.target.value })}
                name={`day-${index}`}
              />
              <Input
                label={SCHEDULE_EXAMPLES.custom.percent}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={row.percent}
                onChange={(event) => update({ ...row, percent: event.target.value })}
                name={`percent-${index}`}
              />
            </>
          )}
        />
        <p
          role="status"
          className={problem ? 'text-small text-danger-ink' : 'text-small text-ink-secondary'}
        >
          {problem ?? SCHEDULE_EXAMPLES.custom.total(sum)}
        </p>
        {blocks.length > 0 ? (
          <>
            <ScheduleTimeline asset={BCH} blocks={blocks} variant="preview" />
            <PlanSentence
              recipient={{ address: '', name: SCHEDULE_EXAMPLES.sampleName }}
              schedule={{
                kind: 'custom',
                asset: BCH,
                releases: blocks.map((block) => ({ amount: block.amount, at: block.at })),
              }}
            />
          </>
        ) : null}
        <div>
          {target ? (
            <ButtonLink variant="secondary" size="sm" to={target}>
              {SCHEDULE_EXAMPLES.use}
            </ButtonLink>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled
              disabledReason={SCHEDULE_EXAMPLES.custom.fixFirst}
            >
              {SCHEDULE_EXAMPLES.use}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function StreamShapeGalleryPage() {
  const [start] = useState(() => Date.now());
  const examples = useMemo(() => buildExamples(start), [start]);
  const common = examples.filter((example) =>
    ['once', 'evenly', 'sameAmount'].includes(example.choice)
  );
  const more = examples.filter((example) => !common.includes(example));

  return (
    <PageContainer>
      <PageHeader
        title={SCHEDULE_EXAMPLES.title}
        description={SCHEDULE_EXAMPLES.description}
        back={{ to: '/streams', label: SCHEDULE_EXAMPLES.backToStreams }}
        primaryAction={
          <ButtonLink variant="primary" leadingIcon={Plus} to="/streams/create">
            {SCHEDULE_EXAMPLES.createCustom}
          </ButtonLink>
        }
      />
      <Stack>
        <section className="flex flex-col gap-4" aria-labelledby="common-schedules">
          <Heading level="section" id="common-schedules">
            {SCHEDULE_EXAMPLES.common}
          </Heading>
          <div className="grid gap-4 lg:grid-cols-2">
            {common.map((example) => (
              <ExampleCard key={example.choice} example={example} />
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-4" aria-labelledby="more-schedules">
          <Heading level="section" id="more-schedules">
            {SCHEDULE_EXAMPLES.more}
          </Heading>
          <div className="grid gap-4 lg:grid-cols-2">
            {more.map((example) => (
              <ExampleCard key={example.choice} example={example} />
            ))}
            <CustomCard start={start} />
          </div>
        </section>
      </Stack>
    </PageContainer>
  );
}
