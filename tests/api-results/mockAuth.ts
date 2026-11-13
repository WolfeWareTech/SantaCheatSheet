export function useAuthenticator() {
  return { user: { signInDetails: { loginId: "synthetic@example.invalid" } }, signOut: () => {} };
}
export async function fetchUserAttributes() { return { given_name: "Synthetic", family_name: "Fixture" }; }
