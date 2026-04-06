import { getNotes } from '@/lib/api/client';

interface CategoryNode {
  id: string;
  name: string;
  notes: { id: string; text: string; createdAt: string; status?: string }[];
  children: CategoryNode[];
}

function CategoryTree({ node, path = [] }: { node: CategoryNode; path?: string[] }) {
  const nextPath = [...path, node.name];
  return (
    <section style={{ marginLeft: path.length * 16 }}>
      <h3>{node.name}</h3>
      <ul>
        {node.notes.map((note) => (
          <li key={note.id}>
            <p>{note.text}</p>
            <small>{new Date(note.createdAt).toLocaleString()} · {nextPath.join(' > ')}</small>
          </li>
        ))}
      </ul>
      {node.children.map((child) => <CategoryTree key={child.id} node={child} path={nextPath} />)}
    </section>
  );
}

export default async function NotesPage() {
  const trees = await getNotes();
  return (
    <main>
      <h1>Notes</h1>
      {trees.map((node: CategoryNode) => <CategoryTree key={node.id} node={node} />)}
    </main>
  );
}
