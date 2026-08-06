export function createCommentLikeController({
  getComment,
  updateComment,
  persistLike,
  setAnimation,
  clearAnimation,
  setPending,
  warn = () => {}
}) {
  const pendingIds = new Set()

  function getCommentId(commentOrId) {
    if (commentOrId && typeof commentOrId === 'object') return commentOrId.id
    return commentOrId
  }

  async function toggle(commentOrId) {
    const commentId = getCommentId(commentOrId)
    if (pendingIds.has(commentId)) return false

    const comment = getComment(commentId)
    if (!comment) return false

    const previousLikes = Math.max(0, Number(comment.likes) || 0)
    const previousIsLiked = Number(comment.is_liked) ? 1 : 0
    const nextLiked = previousIsLiked === 0

    pendingIds.add(commentId)
    setPending(commentId, true)
    updateComment(commentId, {
      likes: Math.max(0, previousLikes + (nextLiked ? 1 : -1)),
      is_liked: nextLiked ? 1 : 0
    })
    setAnimation(commentId, nextLiked ? 'liking' : 'unliking')

    try {
      const savedComment = await persistLike(commentId, Boolean(nextLiked))
      if (!savedComment) throw new Error('Comment was not found')
      updateComment(commentId, {
        likes: Math.max(0, Number(savedComment.likes) || 0),
        is_liked: Number(savedComment.is_liked) ? 1 : 0
      })
    } catch (e) {
      updateComment(commentId, {
        likes: previousLikes,
        is_liked: previousIsLiked
      })
      clearAnimation(commentId)
      warn(e)
    } finally {
      pendingIds.delete(commentId)
      setPending(commentId, false)
    }

    return true
  }

  function isPending(commentId) {
    return pendingIds.has(commentId)
  }

  return { toggle, isPending }
}
