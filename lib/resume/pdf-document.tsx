import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ResumeDocument } from "./types";

const styles = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingBottom: 46,
    paddingHorizontal: 50,
    fontFamily: "Times-Roman",
    fontSize: 10.5,
    color: "#1c1917",
    lineHeight: 1.3,
  },
  name: {
    fontSize: 18,
    textAlign: "center",
    fontFamily: "Times-Bold",
  },
  headline: {
    marginTop: 3,
    fontSize: 11,
    textAlign: "center",
    color: "#44403c",
  },
  contact: {
    marginTop: 3,
    fontSize: 9,
    textAlign: "center",
    color: "#57534e",
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    borderBottomWidth: 0.8,
    borderBottomColor: "#78716c",
    paddingBottom: 2,
    marginBottom: 5,
    fontFamily: "Times-Bold",
  },
  body: {
    fontSize: 10.5,
    textAlign: "justify",
  },
  role: {
    marginTop: 7,
  },
  roleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  roleTitle: {
    fontFamily: "Times-Bold",
    fontSize: 11,
    maxWidth: "78%",
  },
  roleDates: {
    fontSize: 10,
    color: "#44403c",
  },
  roleMeta: {
    marginTop: 1,
    fontSize: 10,
    fontFamily: "Times-Italic",
    color: "#44403c",
  },
  bulletRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  bulletMark: {
    width: 12,
    fontSize: 10.5,
  },
  bullet: {
    flexGrow: 1,
    flexShrink: 1,
    fontSize: 10.5,
    textAlign: "justify",
  },
});

export function ResumePdf({ resume }: { resume: ResumeDocument }) {
  const skills = resume.skills.map((skill) => skill.text).join(" · ");
  return (
    <Document title={resume.name ? `${resume.name} resume` : "Resume"} author={resume.name}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{resume.name}</Text>
        {resume.headline ? <Text style={styles.headline}>{resume.headline}</Text> : null}
        {resume.contactLine ? <Text style={styles.contact}>{resume.contactLine}</Text> : null}

        {resume.summary.text ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.body}>{resume.summary.text}</Text>
          </View>
        ) : null}

        {skills ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <Text style={styles.body}>{skills}</Text>
          </View>
        ) : null}

        {resume.experience.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {resume.experience.map((role) => (
              <View key={`${role.employer}-${role.title}-${role.dates}`} style={styles.role}>
                <View style={styles.roleHeader}>
                  <Text style={styles.roleTitle}>{role.title}</Text>
                  {role.dates ? <Text style={styles.roleDates}>{role.dates}</Text> : null}
                </View>
                <Text style={styles.roleMeta}>
                  {[role.employer, role.location].filter(Boolean).join(" · ")}
                </Text>
                {role.bullets.map((bullet) => (
                  <View key={bullet.text} style={styles.bulletRow}>
                    <Text style={styles.bulletMark}>•</Text>
                    <Text style={styles.bullet}>{bullet.text}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {resume.education.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {resume.education.map((item) => (
              <View key={item.text} style={styles.role}>
                <View style={styles.roleHeader}>
                  <Text style={styles.roleTitle}>{item.degree}</Text>
                  {item.dates ? <Text style={styles.roleDates}>{item.dates}</Text> : null}
                </View>
                {item.school ? <Text style={styles.roleMeta}>{item.school}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
