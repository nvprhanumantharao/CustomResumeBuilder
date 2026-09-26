import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ResumeDocument } from "./types";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 54,
    fontFamily: "Times-Roman",
    fontSize: 10.5,
    color: "#1c1917",
    lineHeight: 1.35,
  },
  name: {
    fontSize: 18,
    textAlign: "center",
    fontFamily: "Times-Roman",
  },
  headline: {
    marginTop: 3,
    fontSize: 11,
    textAlign: "center",
    color: "#44403c",
  },
  contact: {
    marginTop: 3,
    fontSize: 9.5,
    textAlign: "center",
    color: "#57534e",
  },
  section: {
    marginTop: 11,
  },
  sectionTitle: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    borderBottomWidth: 0.6,
    borderBottomColor: "#a8a29e",
    paddingBottom: 2,
    marginBottom: 4,
    fontFamily: "Times-Bold",
  },
  body: {
    fontSize: 10.5,
  },
  roleTitle: {
    marginTop: 6,
    fontFamily: "Times-Bold",
    fontSize: 11,
  },
  roleMeta: {
    fontSize: 10,
    color: "#44403c",
  },
  bullet: {
    marginTop: 2,
    paddingLeft: 8,
    fontSize: 10.5,
  },
});

export function ResumePdf({ resume }: { resume: ResumeDocument }) {
  const skills = resume.skills.map((skill) => skill.text).join(", ");
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
              <View key={`${role.employer}-${role.title}-${role.dates}`}>
                <Text style={styles.roleTitle}>{role.title}</Text>
                <Text style={styles.roleMeta}>
                  {[role.employer, role.location, role.dates].filter(Boolean).join(" · ")}
                </Text>
                {role.bullets.map((bullet) => (
                  <Text key={bullet.text} style={styles.bullet}>
                    • {bullet.text}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {resume.education.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {resume.education.map((item) => (
              <Text key={item.text} style={styles.body}>
                {item.text}
              </Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
