// Role 3: plan review (draft) and dashboard (confirmed). Placeholder.
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-2xl font-semibold">Project {id}</h1>
      <p className="mt-2 text-neutral-600">
        TODO(Role 3): plan review, dashboard, notifications, replan diff. Build against mock/response.json first.
      </p>
    </main>
  );
}
