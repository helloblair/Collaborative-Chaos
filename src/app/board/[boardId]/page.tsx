import BoardClient from "./BoardClient";

export default async function Page({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  return <BoardClient boardId={boardId} />;
}
