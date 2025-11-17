const { AzureOpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4';
const docType = process.env.DOC_TYPE || 'all';
const forceAll = process.env.FORCE_ALL === 'true';

// Initialize Azure OpenAI client
const client = new AzureOpenAI({
  endpoint: endpoint,
  apiKey: apiKey,
  apiVersion: '2024-12-01-preview',
  deployment: deployment
});

// Prompts for different documentation types
const prompts = {
  api: `Analyze this code and generate comprehensive API documentation in Markdown format. Include:
- Function/method signatures
- Parameters and return types
- Usage examples
- Error handling`,
  
  codeComments: `Add detailed inline comments to this code explaining:
- What the code does
- Why specific approaches were chosen
- Any edge cases or assumptions
- Complex logic explanations`,
  
  readme: `Generate a README.md section for this code including:
- Overview and purpose
- Key features
- Usage examples
- Installation/setup if applicable`,
  
  architecture: `Analyze this code and describe:
- Overall architecture and design patterns
- Component relationships
- Data flow
- Key design decisions`
};

async function analyzeCode(filePath, content) {
  const fileExt = path.extname(filePath);
  const language = getLanguage(fileExt);
  
  const messages = [
    {
      role: 'system',
      content: 'You are an expert technical writer who creates clear, comprehensive documentation for code.'
    },
    {
      role: 'user',
      content: `File: ${filePath}\nLanguage: ${language}\n\n${prompts[docType] || prompts.api}\n\nCode:\n\`\`\`${language}\n${content}\n\`\`\``
    }
  ];

  try {
    console.log(`    API Call: model=${deployment}, messages=${messages.length}`);
    const result = await client.chat.completions.create({
      model: deployment,
      messages: messages,
      max_completion_tokens: 16000
    });

    console.log(`    API Response: ${result.choices?.length || 0} choices`);
    
    if (result.choices && result.choices.length > 0) {
      const choice = result.choices[0];
      const content = choice.message?.content;
      console.log(`    Finish reason: ${choice.finish_reason}`);
      console.log(`    Content received: ${content ? 'YES' : 'NO'}`);
      console.log(`    Content length: ${content?.length || 0}`);
      
      if (!content) {
        console.log(`    Full response:`, JSON.stringify(choice, null, 2));
      }
      return content;
    }
    
    console.log(`    No choices in response`);
    return null;
  } catch (error) {
    console.error(`    API Error for ${filePath}:`, error.message);
    if (error.response) {
      console.error(`    Response status: ${error.response.status}`);
      console.error(`    Response data:`, error.response.data);
    }
    return null;
  }
}

function getLanguage(ext) {
  const langMap = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.cpp': 'cpp',
    '.c': 'c',
    '.rb': 'ruby',
    '.php': 'php',
    '.ps1': 'powershell',
    '.psm1': 'powershell',
    '.sh': 'bash',
    '.bash': 'bash',
    '.kt': 'kotlin',
    '.swift': 'swift',
    '.yml': 'yaml',
    '.yaml': 'yaml'
  };
  return langMap[ext] || 'plaintext';
}

async function getChangedFiles() {
  const { execSync } = require('child_process');
  
  try {
    const output = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf-8' });
    const changedFiles = output.trim().split('\n').filter(f => f);
    console.log('Changed files from git:', changedFiles);
    return new Set(changedFiles);
  } catch (error) {
    console.log('Could not get changed files (might be first commit):', error.message);
    return new Set();
  }
}

async function getFilesNeedingDocumentation(allSourceFiles) {
  if (forceAll) {
    console.log('🔄 Force regenerate enabled - processing all files');
    return allSourceFiles.map(file => ({ file, reason: 'forced' }));
  }
  
  const changedFiles = await getChangedFiles();
  const filesToProcess = [];
  
  for (const file of allSourceFiles) {
    const wasChanged = changedFiles.has(file);
    const docPath = path.join('Documentation', file.replace(/\.(js|ts|py|java|go|rs|ps1|psm1|sh|bash|cpp|c|cs|rb|php|kt|swift|yml|yaml)$/, '.md'));
    let docExists = false;
    
    try {
      await fs.access(docPath);
      docExists = true;
    } catch {
      docExists = false;
    }
    
    if (wasChanged || !docExists) {
      filesToProcess.push({
        file,
        reason: wasChanged ? 'changed' : 'missing-docs'
      });
    }
  }
  
  return filesToProcess;
}

async function findSourceFiles() {
  const patterns = [
    '**/*.{js,ts,py,java,go,rs,ps1,psm1,sh,bash,cpp,c,cs,rb,php,kt,swift,yml,yaml}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/vendor/**',
    '!**/.git/**',
    '!**/*.test.*',
    '!**/*.spec.*',
    '!**/Documentation/**'
  ];

  console.log('Searching for files with patterns:', patterns);

  const files = await glob(patterns, { 
    ignore: 'node_modules/**',
    dot: false 
  });

  console.log('Files after applying patterns:', files);
  console.log('Total source files found:', files.length);

  return files;
}

async function generateDocumentation() {
  console.log('🚀 Starting documentation generation...');
  console.log(`Documentation type: ${docType}`);
  console.log(`Endpoint: ${endpoint ? 'Set' : 'MISSING'}`);
  console.log(`API Key: ${apiKey ? 'Set' : 'MISSING'}`);
  console.log(`Deployment: ${deployment}`);

  await fs.mkdir('Documentation', { recursive: true });
  console.log('✓ Documentation directory created');

  const allSourceFiles = await findSourceFiles();
  
  if (allSourceFiles.length === 0) {
    console.log('⚠️  No source files found! Check your file patterns.');
    return;
  }
  
  const filesToProcess = await getFilesNeedingDocumentation(allSourceFiles);
  
  console.log(`\n📊 Processing Summary:`);
  console.log(`   Total source files: ${allSourceFiles.length}`);
  console.log(`   Files needing documentation: ${filesToProcess.length}`);
  console.log(`   Files skipped (already documented): ${allSourceFiles.length - filesToProcess.length}`);
  
  const changedCount = filesToProcess.filter(f => f.reason === 'changed').length;
  const missingCount = filesToProcess.filter(f => f.reason === 'missing-docs').length;
  
  console.log(`   - Changed files: ${changedCount}`);
  console.log(`   - Missing documentation: ${missingCount}\n`);
  
  if (filesToProcess.length === 0) {
    console.log('✅ All files already have up-to-date documentation!');
    return;
  }

  const results = [];
  
  for (const { file, reason } of filesToProcess) {
    console.log(`\nProcessing: ${file} (${reason})`);
    
    try {
      const content = await fs.readFile(file, 'utf-8');
      console.log(`  File size: ${content.length} characters`);
      
      if (content.length < 10) {
        console.log(`  ⏭️  Skipped (too small: ${content.length} chars)`);
        continue;
      }
      
      if (content.length > 200000) {
        console.log(`  ⏭️  Skipped (too large: ${content.length} chars, max is 200000)`);
        continue;
      }
      
      let processContent = content;
      if (content.length > 100000) {
        console.log(`  ⚠️  Large file detected. Processing first 100000 characters...`);
        processContent = content.substring(0, 100000);
      }

      console.log(`  Sending to Azure OpenAI...`);
      const documentation = await analyzeCode(file, processContent);
      
      if (documentation) {
        const docPath = path.join('Documentation', file.replace(/\.(js|ts|py|java|go|rs|ps1|psm1|sh|bash|cpp|c|cs|rb|php|kt|swift|yml|yaml)$/, '.md'));
        await fs.mkdir(path.dirname(docPath), { recursive: true });
        await fs.writeFile(docPath, documentation);
        
        results.push({ file, docPath, success: true });
        console.log(`  ✅ Generated: ${docPath}`);
      } else {
        console.log(`  ❌ No documentation returned from API`);
        results.push({ file, success: false, error: 'No documentation generated' });
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      results.push({ file, success: false, error: error.message });
    }
    
    console.log(`  Waiting 1 second before next request...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await generateSummary(results);
  
  console.log('\n✨ Documentation generation complete!');
  console.log(`Successful: ${results.filter(r => r.success).length}/${results.length}`);
}

async function generateSummary(results) {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  let summary = '# Documentation Summary\n\n';
  summary += `Generated: ${new Date().toISOString()}\n\n`;
  summary += `## Statistics\n\n`;
  summary += `- Total files processed: ${results.length}\n`;
  summary += `- Successfully documented: ${successful.length}\n`;
  summary += `- Failed: ${failed.length}\n\n`;

  if (successful.length > 0) {
    summary += `## Generated Documentation\n\n`;
    for (const result of successful) {
      summary += `- ${result.docPath}\n`;
    }
  }

  if (failed.length > 0) {
    summary += `\n## Failed Files\n\n`;
    for (const result of failed) {
      summary += `- ${result.file}: ${result.error}\n`;
    }
  }

  await fs.writeFile('Documentation/SUMMARY.md', summary);
}

// Run the generator
generateDocumentation().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
