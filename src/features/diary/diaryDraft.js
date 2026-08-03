export function persistDiaryDraft(storage, key, draft) {
  storage.setItem(key, JSON.stringify(draft))
}
