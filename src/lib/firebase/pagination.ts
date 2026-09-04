import {
  getDocs,
  limit,
  query,
  startAfter,
  type DocumentData,
  type Query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

export type FirestoreCursor = QueryDocumentSnapshot<DocumentData> | null;

export type CursorPage<T> = {
  items: T[];
  cursor: FirestoreCursor;
  hasNext: boolean;
};

/** Fetch one page without reading the rest of the collection. */
export async function getCursorPage<T>(
  baseQuery: Query<DocumentData>,
  cursor: FirestoreCursor,
  map: (snapshot: QueryDocumentSnapshot<DocumentData>) => T,
  pageSize = 25,
): Promise<CursorPage<T>> {
  const constraints: QueryConstraint[] = [limit(pageSize + 1)];
  if (cursor) constraints.unshift(startAfter(cursor));

  const snapshot = await getDocs(query(baseQuery, ...constraints));
  const pageDocs = snapshot.docs.slice(0, pageSize);

  return {
    items: pageDocs.map(map),
    cursor: pageDocs.at(-1) ?? null,
    hasNext: snapshot.docs.length > pageSize,
  };
}
