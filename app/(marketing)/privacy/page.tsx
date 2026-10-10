import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/src/components/LegalPage";
import { LEGAL } from "@/src/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy · Noirly Flow",
  description: "What Noirly Flow (web and Android) collects, why, who can see it, how long it is kept, and how to delete it.",
};

export default function FlowPrivacyPage() {
  const contact = LEGAL.contactEmail;

  return (
    <LegalPage
      eyebrow={`Noirly Flow · Effective ${LEGAL.effectiveDate}`}
      title="Privacy policy"
      lead={
        <p>
          This policy covers Noirly Flow on the web ({LEGAL.webHost}) and the Noirly Flow Android app ({LEGAL.androidPackage}):
          what it collects, why, who can see it, how long it is kept and how to delete it. In short: Flow stores the work you
          put in it, shows it only to you and the people you share a workspace with, never sells it, and has no ads or
          trackers.
        </p>
      }
    >
      <LegalSection id="who" title="Who we are">
        <p>
          Noirly Flow is run by {LEGAL.operator}, based in {LEGAL.country}, who is responsible for the data Flow holds
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        </p>
        <p>
          You sign in to Flow with a <strong>Noirly account</strong>, which is provided by Noirly Identity. Your account
          itself (email, name, password, Google sign-in and sign-in records) is covered by the{" "}
          <a href={LEGAL.identityPrivacyUrl}>Noirly Identity privacy policy</a>. This policy covers what Flow itself keeps.
        </p>
      </LegalSection>

      <LegalSection id="collect" title="What Flow collects">
        <ul>
          <li>
            <strong>Your profile in Flow:</strong> the name, email address and picture Noirly Identity shares with Flow when
            you sign in, and anything you add to your Flow profile (display name, title, timezone, bio).
          </li>
          <li>
            <strong>Your work:</strong> workspaces, projects, board columns, tasks (titles, descriptions, status, priority,
            start and due dates, repeats, checklists, subtasks, tags, assignees), and comments.
          </li>
          <li>
            <strong>Team information:</strong> workspace memberships and roles, and invite links you create.
          </li>
          <li>
            <strong>Activity history:</strong> a record of changes in each workspace (who created, edited, completed or
            commented on what, and when), which members of that workspace can see and export.
          </li>
          <li>
            <strong>Presence:</strong> while you have a project open, other members can see that you are online and viewing
            it. This is not stored after you leave.
          </li>
        </ul>
        <p>
          <strong>Flow does not collect</strong> your location, contacts, photos or files from your device, advertising IDs,
          or usage analytics. The Android app asks only for internet access and contains no advertising, analytics or
          crash-reporting SDKs.
        </p>
      </LegalSection>

      <LegalSection id="use" title="How we use it">
        <ul>
          <li>To provide Flow: store your work, keep it in sync across the web and your devices, and show it to you.</li>
          <li>To share a workspace&apos;s content with its members, and to show live updates and presence.</li>
          <li>To keep the service secure and working, for example by checking that requests come from a signed-in member.</li>
        </ul>
        <p>We do not sell your data, use it for advertising, or build profiles of you.</p>
      </LegalSection>

      <LegalSection id="share" title="Who can see it, and who we share it with">
        <ul>
          <li>
            <strong>You:</strong> your personal workspace is visible only to you.
          </li>
          <li>
            <strong>Members of your team workspaces</strong> see that workspace&apos;s projects, tasks, comments and
            activity, and your name and picture. Viewers can read but not change things.
          </li>
          <li>
            <strong>Noirly Identity</strong> signs you in. Flow asks it only to confirm who you are.
          </li>
          <li>
            <strong>Service providers</strong> that host Flow&apos;s servers, database and live-update service for us and
            process data only on our instructions.
          </li>
          <li>
            <strong>Authorities</strong>, only if the law requires it.
          </li>
        </ul>
        <p>We do not share your data with anyone else.</p>
      </LegalSection>

      <LegalSection id="device" title="On your device">
        <p>
          On the web, Flow uses strictly necessary cookies to keep you signed in and protect sign-in (session and security
          cookies), and remembers your theme in your browser. The Android app keeps its sign-in tokens in Android&apos;s
          encrypted keystore and remembers the last workspace and project you opened. Both are removed when you sign out
          or uninstall the app.
        </p>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          All traffic between your device and Flow is encrypted (HTTPS and secure WebSockets). Every request is checked
          against your Noirly sign-in and your role in the workspace before data is returned or changed.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <ul>
          <li>Your profile and work: for as long as you have a Noirly account, or until you delete them.</li>
          <li>Tasks you delete are hidden straight away and kept only as part of the workspace&apos;s history.</li>
          <li>
            When your account is deleted, Flow deletes your data straight away (see below). Copies in our hosting
            provider&apos;s backups are overwritten on their normal backup cycle.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="delete" title="Deleting your data">
        <p>You can delete your account and your Flow data at any time:</p>
        <ul>
          <li>
            <strong>In the Android app:</strong> Menu → Delete account.
          </li>
          <li>
            <strong>On the web:</strong> <a href={LEGAL.deleteAccountUrl}>{LEGAL.deleteAccountUrl.replace("https://", "")}</a>.
          </li>
        </ul>
        <p>
          This deletes your Flow profile, your personal workspace, team workspaces where you are the only member, and your
          comments, activity and invites. In team workspaces shared with others, tasks you created stay with the team (they
          belong to the workspace) but are no longer linked to you, and if you owned the workspace, ownership passes to
          another member. This cannot be undone.
        </p>
      </LegalSection>

      <LegalSection id="rights" title="Your choices and rights">
        <p>
          You can see and change your work and Flow profile in the app, export a workspace&apos;s activity as CSV, and
          delete your account as described above. Depending on where you live (including under India&apos;s
          Digital Personal Data Protection Act, 2023), you may also have the right to request a copy of your data, to have
          it corrected or erased, and to complain to a data protection authority. To make a request, email{" "}
          <a href={`mailto:${contact}`}>{contact}</a>.
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>
          Noirly Flow is not meant for children under 13, and we do not knowingly collect their data. If you believe a child
          is using Flow, contact us and we will delete their data.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <p>
          If we change this policy, we will update the date at the top of this page. For significant changes we will tell
          you in the app or by email before they take effect.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <p>
          Questions about privacy in Noirly Flow? Email <a href={`mailto:${contact}`}>{contact}</a>. For your Noirly
          account itself, see the <a href={LEGAL.identityPrivacyUrl}>Noirly Identity privacy policy</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
