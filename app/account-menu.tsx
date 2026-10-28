import Link from "next/link";
import { canViewOthers, getCurrentUser } from "@/lib/auth";
import { logout } from "./actions/auth";
import styles from "./account-menu.module.css";

/** Signed-in name with links to the learning report, or sign-in links. */
export async function AccountMenu({ tone = "light" }: { tone?: "light" | "bar" }) {
  const user = await getCurrentUser();
  return (
    <div className={`${styles.menu} ${tone === "bar" ? styles.bar : ""}`}>
      {user ? (
        <>
          <span className={styles.name} title={user.email ?? user.phone ?? undefined}>
            {user.name.split(" ")[0]}
          </span>
          {canViewOthers(user.role) && (
            <Link href="/demo-registrations" className={styles.link}>
              Demo bookings
            </Link>
          )}
          <Link href="/reports" className={styles.report}>
            My report
          </Link>
          <form action={logout}>
            <button type="submit" className={styles.link}>
              Sign out
            </button>
          </form>
        </>
      ) : (
        <>
          <Link href="/login" className={styles.link}>
            Sign in
          </Link>
          <Link href="/register" className={styles.report}>
            Register
          </Link>
        </>
      )}
    </div>
  );
}
