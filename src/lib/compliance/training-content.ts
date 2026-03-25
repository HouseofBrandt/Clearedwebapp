export interface TrainingModule {
  id: string
  title: string
  description: string
  sections: { title: string; content: string }[]
  quiz: { question: string; options: string[]; correctIndex: number }[]
  passingScore: number // percentage
  version: number
}

export const TRAINING_MODULES: TrainingModule[] = [
  {
    id: "data-handling",
    title: "Client Data Handling & PII Protection",
    description: "How to properly handle taxpayer PII, encrypted data, and confidential case information.",
    version: 1,
    passingScore: 80,
    sections: [
      {
        title: "What is PII in Tax Resolution?",
        content: "In tax resolution, Personally Identifiable Information (PII) includes: Social Security Numbers (SSNs), Employer Identification Numbers (EINs), taxpayer names, addresses, dates of birth, bank account numbers, and IRS account data. Under IRC \u00a7 7216, unauthorized disclosure of tax return information is a federal crime punishable by fines and imprisonment.\n\nCleared automatically tokenizes all PII before sending data to AI models. You should never:\n- Copy PII into external tools or documents\n- Share client data via personal email\n- Discuss specific client details in public spaces\n- Screenshot client records without authorization"
      },
      {
        title: "Encryption and Access Controls",
        content: "All client data in Cleared is encrypted at rest (AES-256) and in transit (TLS 1.2+). Your access is controlled by your role:\n\n- You can only see cases assigned to you (unless you're an Admin)\n- Exported documents are watermarked with your user ID\n- Every document you view is logged in the audit trail\n- Session timeouts occur after 30 minutes of inactivity\n\nNever share your login credentials or leave your session unattended."
      },
      {
        title: "AI-Generated Content Review",
        content: "All AI outputs in Cleared are drafts that require human review. Before approving any AI-generated document:\n\n1. Verify all factual claims against source documents\n2. Check that PII was properly de-tokenized (no [SSN-xxxx] tokens in output)\n3. Confirm legal citations are accurate\n4. Ensure the tone and content are appropriate for the intended audience\n5. Never send AI output directly to clients or the IRS without review"
      }
    ],
    quiz: [
      {
        question: "Under IRC \u00a7 7216, unauthorized disclosure of tax return information can result in:",
        options: ["A warning letter", "Federal criminal penalties including fines and imprisonment", "Temporary suspension of access", "A compliance review"],
        correctIndex: 1
      },
      {
        question: "What happens to PII before it is sent to the AI model?",
        options: ["It is sent as-is for accuracy", "It is tokenized (replaced with non-identifying placeholders)", "It is encrypted with the user's key", "It is anonymized by removing all dates"],
        correctIndex: 1
      },
      {
        question: "When is it appropriate to approve AI-generated content without reviewing it?",
        options: ["When you're busy and trust the AI", "When the AI confidence score is above 90%", "Never \u2014 all AI output requires human review", "When the client has approved it"],
        correctIndex: 2
      },
      {
        question: "If you discover PII tokens (like [SSN-xxxx]) in an AI output, you should:",
        options: ["Manually replace them with the real data", "Reject the output and flag for re-processing", "Approve it since tokens protect privacy", "Delete the output immediately"],
        correctIndex: 1
      },
      {
        question: "Your session in Cleared times out after:",
        options: ["1 hour", "30 minutes of inactivity", "24 hours", "It never times out"],
        correctIndex: 1
      }
    ]
  },
  {
    id: "phishing-awareness",
    title: "Phishing & Social Engineering Awareness",
    description: "Recognizing and responding to phishing attempts and social engineering tactics.",
    version: 1,
    passingScore: 80,
    sections: [
      {
        title: "Common Phishing Tactics",
        content: "Tax resolution firms are high-value targets because they handle sensitive financial data. Common phishing tactics include:\n\n- Emails impersonating the IRS requesting 'immediate verification'\n- Fake client emails with malicious attachments ('here are my tax documents')\n- Vendor impersonation ('your Cleared account needs to be updated')\n- Spear phishing targeting specific practitioners by name\n\nAlways verify unexpected requests through a separate communication channel."
      },
      {
        title: "How to Respond",
        content: "If you receive a suspicious email or communication:\n\n1. Do NOT click any links or download attachments\n2. Do NOT reply to the sender\n3. Report it immediately to your firm's Admin/IT contact\n4. If you accidentally clicked a link: disconnect from the network and report immediately\n5. If you entered credentials on a suspicious site: change your password immediately and report\n\nCleared will never ask for your password via email."
      }
    ],
    quiz: [
      {
        question: "You receive an email from 'IRS-Support@irs-gov.com' asking you to verify client information. What should you do?",
        options: ["Reply with the requested information since it's from the IRS", "Click the link to check if it's legitimate", "Report it as phishing \u2014 the IRS does not use that domain", "Forward it to your client"],
        correctIndex: 2
      },
      {
        question: "A new client sends you a password-protected ZIP file with 'tax documents.' What is the safest approach?",
        options: ["Download and open it since the client sent it", "Ask the client to verify the file through a separate phone call before opening", "Scan it with antivirus and then open it", "Forward it to your personal email for safe keeping"],
        correctIndex: 1
      },
      {
        question: "If you accidentally clicked a phishing link, you should:",
        options: ["Wait and see if anything happens", "Clear your browser history", "Immediately report it and change your passwords", "Ignore it if nothing looks wrong"],
        correctIndex: 2
      }
    ]
  },
  {
    id: "incident-reporting",
    title: "Security Incident Reporting",
    description: "How to recognize and report security incidents promptly.",
    version: 1,
    passingScore: 80,
    sections: [
      {
        title: "What Qualifies as a Security Incident",
        content: "A security incident is any event that threatens the confidentiality, integrity, or availability of client data. Examples include:\n\n- Unauthorized access to a client record\n- Lost or stolen device that had access to Cleared\n- Accidentally sending client data to the wrong recipient\n- Discovering that a colleague shared credentials\n- Noticing unusual activity in your account\n- System outages that prevent access to critical deadlines"
      },
      {
        title: "Reporting Procedure",
        content: "When you identify a potential incident:\n\n1. Document what you observed (timestamp, what happened, who was involved)\n2. Report immediately to your Admin \u2014 do not wait\n3. Do not attempt to 'fix' it yourself or cover it up\n4. Preserve any evidence (don't delete emails, logs, or files)\n5. Cooperate with the investigation\n\nTimely reporting is critical. A delayed report can turn a minor incident into a major breach. There are no penalties for good-faith reporting."
      }
    ],
    quiz: [
      {
        question: "You accidentally sent a client's tax return to the wrong email address. This is:",
        options: ["Not a big deal since it was an accident", "A reportable security incident", "Only a problem if the recipient complains", "Something you should fix by asking the recipient to delete it"],
        correctIndex: 1
      },
      {
        question: "What is the correct first step when you discover a potential security incident?",
        options: ["Try to fix it before telling anyone", "Document what happened and report immediately", "Wait 24 hours to see if it resolves", "Email the compliance team next week"],
        correctIndex: 1
      }
    ]
  },
  {
    id: "client-confidentiality",
    title: "Client Confidentiality in Tax Resolution",
    description: "Maintaining attorney-client privilege, work product protection, and ethical obligations.",
    version: 1,
    passingScore: 80,
    sections: [
      {
        title: "Confidentiality Obligations",
        content: "Tax resolution practitioners have multiple overlapping confidentiality obligations:\n\n- IRC \u00a7 7216: Federal criminal statute prohibiting disclosure of tax return information\n- Circular 230: Treasury Department regulations governing practitioner conduct\n- Attorney-client privilege: If your firm has attorneys, some communications may be privileged\n- State licensing requirements: EAs, CPAs, and attorneys have state-specific obligations\n\nIn Cleared, notes can be marked as 'privileged' to flag attorney-client protected content. Privileged notes are excluded from data exports and subject to enhanced access controls."
      },
      {
        title: "What You Can and Cannot Share",
        content: "You CAN:\n- Discuss case strategy with team members assigned to the case\n- Share case information with the client (or their authorized representative)\n- Communicate with the IRS on behalf of the client (with proper authorization)\n\nYou CANNOT:\n- Discuss client cases with practitioners not assigned to the case\n- Share client data outside of Cleared (personal email, messaging apps, etc.)\n- Discuss client details in public or semi-public settings\n- Use client data for any purpose other than the engagement"
      }
    ],
    quiz: [
      {
        question: "A colleague who is not assigned to a case asks you about the client's tax situation. You should:",
        options: ["Share the information since they work at the firm", "Politely decline and explain they need to be assigned to the case", "Give them a brief summary without specific details", "Check with the client first"],
        correctIndex: 1
      },
      {
        question: "When a note is marked as 'privileged' in Cleared, it means:",
        options: ["It's a high-priority note", "It contains attorney-client protected content and has enhanced access controls", "Only the Admin can see it", "It will be included in all AI-generated outputs"],
        correctIndex: 1
      }
    ]
  }
]
