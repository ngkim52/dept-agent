import DebateRoom from "./DebateRoom";

// 토론방 관전 화면 — params/searchParams 를 서버에서 풀어 클라이언트 컴포넌트로 넘긴다.
export default async function DebateRoomPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return <DebateRoom id={id} initialTab={tab === "report" ? "report" : "live"} />;
}
