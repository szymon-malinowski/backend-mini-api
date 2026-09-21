export function showMe(request, response) {
  response.json({
    id: request.user.id,
    clerkId: request.user.clerkId,
    sessionExpiresAt: request.user.session.expires_at,
  });
}
