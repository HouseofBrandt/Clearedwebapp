import { requireAuth } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { InboxList } from "@/components/inbox/inbox-list"

export default async function InboxPage() {
  const session = await requireAuth()
  const userId = session.user.id

  const [messages, unreadCount, users] = await Promise.all([
    prisma.message.findMany({
      where: { recipientId: userId, archived: false },
      include: {
        sender: { select: { id: true, name: true } },
        case: { select: { id: true, tabsNumber: true } },
        implementedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.message.count({
      where: { recipientId: userId, read: false, archived: false },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
  ])

  // Fetch cases for compose dialog
  const cases = await prisma.case.findMany({
    select: { id: true, tabsNumber: true, clientName: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  return (
    <div className="page-enter">
      <InboxList
        initialMessages={JSON.parse(JSON.stringify(messages))}
        initialUnreadCount={unreadCount}
        currentUserId={userId}
        currentUserRole={session.user.role}
        users={JSON.parse(JSON.stringify(users))}
        cases={JSON.parse(JSON.stringify(cases))}
      />
    </div>
  )
}
