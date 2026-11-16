/**
 * Demo data for local development: one organization, users for every role, three
 * divisions and a populated Engineering board. Refuses to run on a non-empty database.
 *
 * Every account uses the password `password123`.
 */
import { hash } from '@node-rs/argon2';
import { positionAfter, type OrgRole } from '@nexus/shared';
import { PrismaClient, type Priority } from '@prisma/client';

const prisma = new PrismaClient();
const PASSWORD = 'password123';
const day = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);

async function main() {
  if ((await prisma.organization.count()) > 0) {
    console.log('Database already has an organization — skipping seed.');
    return;
  }

  const passwordHash = await hash(PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  const org = await prisma.organization.create({ data: { name: 'Nexus Startup' } });

  const people: { key: string; name: string; email: string; role: OrgRole }[] = [
    { key: 'owner', name: 'Raka Pratama', email: 'owner@nexus.local', role: 'OWNER' },
    { key: 'admin', name: 'Sinta Ops', email: 'admin@nexus.local', role: 'ADMIN' },
    { key: 'lead', name: 'Dimas Engineering', email: 'lead@nexus.local', role: 'DIVISION_LEAD' },
    { key: 'dev1', name: 'Ayu Frontend', email: 'ayu@nexus.local', role: 'MEMBER' },
    { key: 'dev2', name: 'Bima Backend', email: 'bima@nexus.local', role: 'MEMBER' },
    { key: 'mkt', name: 'Citra Marketing', email: 'citra@nexus.local', role: 'DIVISION_LEAD' },
    { key: 'guest', name: 'Freelancer Desain', email: 'guest@nexus.local', role: 'GUEST' },
  ];

  const users: Record<string, string> = {};
  for (const p of people) {
    const user = await prisma.user.create({
      data: {
        name: p.name,
        email: p.email,
        passwordHash,
        emailVerifiedAt: new Date(),
        orgMemberships: { create: { orgId: org.id, role: p.role } },
      },
    });
    users[p.key] = user.id;
  }
  const u = (key: string) => users[key]!;

  const engineering = await prisma.division.create({
    data: {
      orgId: org.id,
      name: 'Engineering',
      description: 'Produk, infrastruktur, dan kualitas.',
      color: '#0070F3',
      members: {
        create: [
          { userId: u('lead'), role: 'LEAD' },
          { userId: u('dev1') },
          { userId: u('dev2') },
        ],
      },
    },
  });
  await prisma.division.create({
    data: {
      orgId: org.id,
      name: 'Marketing',
      color: '#F59E0B',
      members: { create: [{ userId: u('mkt'), role: 'LEAD' }, { userId: u('dev1') }] },
    },
  });
  await prisma.division.create({ data: { orgId: org.id, name: 'HR', color: '#10B981' } });

  const project = await prisma.project.create({
    data: {
      divisionId: engineering.id,
      name: 'NexusTask v1',
      description: 'Rilis MVP platform task management.',
      createdById: u('lead'),
      members: {
        create: [
          { userId: u('lead'), role: 'ADMIN' },
          { userId: u('dev1') },
          { userId: u('dev2') },
          { userId: u('guest') },
        ],
      },
    },
  });

  const labelSpecs = [
    ['Feature', '#3B82F6'],
    ['UI-UX', '#8B5CF6'],
    ['Security', '#EF4444'],
    ['Bug', '#F59E0B'],
  ] as const;
  const labels: Record<string, string> = {};
  for (const [name, color] of labelSpecs) {
    labels[name] = (await prisma.label.create({ data: { projectId: project.id, name, color } })).id;
  }

  const lists: Record<string, string> = {};
  let listPos: string | null = null;
  for (const name of ['To Do', 'In Progress', 'Review', 'Done']) {
    listPos = positionAfter(listPos);
    lists[name] = (await prisma.boardList.create({ data: { projectId: project.id, name, position: listPos } })).id;
  }

  const cards: {
    list: string;
    title: string;
    priority: Priority;
    due?: number;
    assignees: string[];
    labels: string[];
    checklist?: [string, boolean][];
    done?: boolean;
  }[] = [
    { list: 'To Do', title: 'Halaman laporan divisi', priority: 'LOW', due: 10, assignees: ['dev1'], labels: ['Feature'] },
    { list: 'To Do', title: 'Audit kontras warna WCAG AA', priority: 'MEDIUM', due: 1, assignees: ['dev1', 'guest'], labels: ['UI-UX'] },
    {
      list: 'In Progress', title: 'Drag & drop kartu real-time', priority: 'HIGH', due: 0, assignees: ['dev1', 'dev2'],
      labels: ['Feature'], checklist: [['Optimistic update', true], ['Fractional index', true], ['Sinkron Socket.IO', false], ['Uji 2 client', false]],
    },
    { list: 'In Progress', title: 'Rate limit login 5x / 15 menit', priority: 'URGENT', due: -2, assignees: ['dev2'], labels: ['Security'] },
    { list: 'Review', title: 'Presigned upload ke R2', priority: 'MEDIUM', due: 3, assignees: ['dev2'], labels: ['Feature', 'Security'] },
    { list: 'Done', title: 'Setup monorepo pnpm + Turborepo', priority: 'NONE', assignees: ['lead'], labels: [], done: true },
  ];

  const positions: Record<string, string | null> = {};
  for (const c of cards) {
    const position = positionAfter(positions[c.list] ?? null);
    positions[c.list] = position;
    let itemPos: string | null = null;
    await prisma.card.create({
      data: {
        projectId: project.id,
        listId: lists[c.list]!,
        title: c.title,
        priority: c.priority,
        dueDate: c.due === undefined ? null : day(c.due),
        completedAt: c.done ? new Date() : null,
        position,
        createdById: u('lead'),
        assignees: { create: c.assignees.map((key) => ({ userId: u(key) })) },
        labels: { create: c.labels.map((name) => ({ labelId: labels[name]! })) },
        checklist: {
          create: (c.checklist ?? []).map(([title, isDone]) => {
            itemPos = positionAfter(itemPos);
            return { title, isDone, position: itemPos };
          }),
        },
      },
    });
  }

  console.log(`Seeded. Log in with any of: ${people.map((p) => p.email).join(', ')} / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
