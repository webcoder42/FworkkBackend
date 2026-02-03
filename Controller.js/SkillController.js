const COMMON_SKILLS = [
  // Web Development
  "React", "Node.js", "JavaScript", "TypeScript", "HTML5", "CSS3", "Sass", "Tailwind CSS", "Bootstrap",
  "Angular", "Vue.js", "Next.js", "Nuxt.js", "Redux", "GraphQL", "REST API", "Webhooks",
  "Express.js", "NestJS", "Fastify", "Django", "Flask", "Ruby on Rails", "Laravel", "Spring Boot",
  "ASP.NET", "Wordpress", "Shopify", "Webflow", "Wix",

  // Mobile Development
  "React Native", "Flutter", "Swift", "SwiftUI", "Kotlin", "Java", "Objective-C", "Ionic", "Xamarin",

  // Database
  "MongoDB", "PostgreSQL", "MySQL", "Redis", "Firebase", "SQLite", "MariaDB", "Oracle", "Cassandra", "DynamoDB",

  // DevOps & Cloud
  "AWS", "Azure", "Google Cloud", "Heroku", "Vercel", "Netlify", "Docker", "Kubernetes", "Jenkins",
  "GitHub Actions", "GitLab CI", "Terraform", "Ansible", "Nginx", "Apache",

  // Languages
  "Python", "Java", "C++", "C#", "PHP", "Go", "Rust", "Ruby", "Scala", "Shell Scripting", "R", "Dart",

  // AI & Data Science
  "Machine Learning", "Deep Learning", "Data Analysis", "Data Visualization", "Pandas", "NumPy",
  "Scikit-learn", "TensorFlow", "PyTorch", "OpenCV", "NLP", "Computer Vision",

  // Design
  "UI/UX Design", "Figma", "Adobe XD", "Photoshop", "Illustrator", "Canva", "After Effects",

  // Marketing & Writing
  "SEO", "SEM", "SMM", "Content Writing", "Copywriting", "Email Marketing", "Google Analytics",

  // Miscellaneous
  "Project Management", "Agile", "Scrum", "Git", "GitHub", "Bitbucket", "Trello", "Jira",
  "Excel", "Salesforce", "QA Testing", "Cybersecurity", "Blockchain", "Web3"
];

/**
 * Autocomplete skills using Internal database (Fallback for dead DataAtWork API)
 * GET /api/v1/skills?q=<query>
 */
export const autocompleteSkills = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    const query = q.toLowerCase();
    
    // Filter common skills internally
    const filteredSkills = COMMON_SKILLS
      .filter(skill => skill.toLowerCase().includes(query))
      .sort((a, b) => {
        // Boost exact starts
        const aStart = a.toLowerCase().startsWith(query);
        const bStart = b.toLowerCase().startsWith(query);
        if (aStart && !bStart) return -1;
        if (!aStart && bStart) return 1;
        return a.localeCompare(b);
      })
      .slice(0, 10)
      .map(skill => ({
        name: skill,
        uuid: `internal-${skill.replace(/\s+/g, '-').toLowerCase()}`
      }));

    res.status(200).json({
      success: true,
      count: filteredSkills.length,
      data: filteredSkills,
    });
  } catch (error) {
    console.error("❌ Error fetching skills:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
