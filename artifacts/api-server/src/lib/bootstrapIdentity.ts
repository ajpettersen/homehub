interface ClerkEmailAddress {
  id: string;
  email_address: string;
  verification?: {
    status?: string;
  } | null;
}

interface ClerkUserResponse {
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
}

export async function isConfiguredBootstrapIdentity(clerkId: string): Promise<boolean> {
  const configuredClerkId = process.env.HOMEHUB_BOOTSTRAP_CLERK_ID?.trim();
  if (configuredClerkId?.startsWith("user_") && configuredClerkId === clerkId) {
    return true;
  }

  const configuredEmail = process.env.HOMEHUB_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!configuredEmail || !clerkSecretKey) return false;

  try {
    const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`, {
      headers: { Authorization: `Bearer ${clerkSecretKey}` },
    });
    if (!response.ok) return false;

    const user = await response.json() as ClerkUserResponse;
    const primaryEmail = user.email_addresses?.find(
      email => email.id === user.primary_email_address_id,
    );

    return primaryEmail?.verification?.status === "verified"
      && primaryEmail.email_address.trim().toLowerCase() === configuredEmail;
  } catch {
    return false;
  }
}