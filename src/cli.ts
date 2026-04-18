#!/usr/bin/env node
import { Command } from 'commander';
import boxen from 'boxen';
import chalk from 'chalk';
import { BanterAI } from './ai.js';
import { type GenerationOptions } from './types.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { downloadImage, createSafeFilename } from './download.js';

const program = new Command();

program
  .name('banter')
  .description('AI Idea Generator for BanterWearCo Etsy Store')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate funny POD product ideas with descriptions, tags, and TOP QUALITY image prompts (with optional DALL-E 3 image generation)')
  .option('-c, --count <number>', 'Number of ideas to generate', '3')
  .option('-t, --theme <string>', 'Specific theme or keyword (e.g. "dinosaur", "parenting fail", "office humor")')
  .option('-s, --style <style>', 'Style: funny, trending, unique, or all', 'all')
  .option('-o, --output <path>', 'Output directory for generated ideas', './ideas')
  .option('--images', 'Generate actual images using DALL-E 3 (slower, higher quality)')
  .option('--json', 'Output only JSON (no pretty printing)')
  .action(async (options) => {
    console.log(boxen(chalk.bold.blue('🤖 BanterWearCo AI Idea Generator'), {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'blue'
    }));

    if (!process.env.OPENAI_API_KEY) {
      console.error(chalk.red('Error: OPENAI_API_KEY environment variable is required.'));
      console.log(chalk.yellow('\nCreate a .env file from .env.example and add your OpenAI key.'));
      process.exit(1);
    }

    const count = parseInt(options.count);
    const generateImages = !!options.images;
    const genOptions: GenerationOptions = {
      theme: options.theme,
      style: options.style as any,
      includeImagePrompts: true,
    };

    console.log(chalk.cyan(`\nGenerating ${count} hilarious product ideas for BanterWearCo...`));
    if (generateImages) {
      console.log(chalk.magenta('🎨 DALL-E 3 image generation ENABLED (high quality, slower)'));
      console.log(chalk.gray('Image generation adds ~15-20 seconds per design...\n'));
    } else {
      console.log(chalk.gray('Top-tier image prompts will be generated. Use --images for actual DALL-E 3 generation.\n'));
    }

    const ai = new BanterAI();

    try {
      let results;
      if (generateImages) {
        results = await ai.generateIdeasWithImages(count, genOptions);
      } else {
        results = await ai.generateMultiple(count, genOptions);
      }

      // Download and save images locally if they were generated
      const ideas = await Promise.all(results.map(async (idea: any, index: number) => {
        if (idea.imageUrl) {
          try {
            const safeName = createSafeFilename(idea.concept, index);
            const localPath = await downloadImage(idea.imageUrl, safeName);
            return {
              ...idea,
              localImagePath: localPath,
              imageUrl: undefined // Remove temporary URL after saving
            };
          } catch (downloadError) {
            console.warn(`Failed to save image for idea ${index + 1}:`, downloadError);
            return idea;
          }
        }
        return idea;
      }));

      const outputDir = options.output;
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = join(outputDir, `ideas-${timestamp}.json`);

      writeFileSync(outputPath, JSON.stringify(ideas, null, 2));

      if (!options.json) {
        ideas.forEach((idea, index) => {
          let displayContent = `${chalk.bold.magenta(`#${index + 1}`)} ${chalk.bold.white(idea.concept)}\n\n` +
            `${chalk.yellow('Title:')} ${idea.title}\n\n` +
            `${chalk.yellow('Category:')} ${idea.category} | ${chalk.yellow('Style:')} ${idea.humorStyle}\n`;

          if (idea.trendingAngle) {
            displayContent += `${chalk.yellow('Trending:')} ${idea.trendingAngle}\n\n`;
          }

          displayContent += `${chalk.cyan('Description:')}\n${idea.description.substring(0, 180)}...\n\n` +
            `${chalk.green('Tags:')} ${idea.tags.slice(0, 8).join(', ')}${idea.tags.length > 8 ? '...' : ''}\n\n` +
            `${chalk.blue('🎨 Image Prompt (Top Quality):')}\n${idea.imagePrompt.substring(0, 160)}...\n\n` +
            `${chalk.magenta('Color Strategy:')} ${idea.colorStrategy || 'High contrast design optimized for both light and dark clothing'}\n`;

          if ('printReadyPrompt' in idea && idea.printReadyPrompt) {
            displayContent += `\n${chalk.yellow('Print-Ready Notes:')} ${idea.printReadyPrompt.substring(0, 120)}...`;
          }

          if ('localImagePath' in idea && idea.localImagePath) {
            displayContent += `\n\n${chalk.green.bold('🖼️  IMAGE SAVED:')} ${idea.localImagePath}`;
          } else if ('imageUrl' in idea && idea.imageUrl) {
            displayContent += `\n\n${chalk.green.bold('🖼️  IMAGE GENERATED:')} ${idea.imageUrl}`;
          }

          console.log(boxen(displayContent, {
            padding: 1,
            margin: { top: 1, bottom: 1 },
            borderColor: 'magenta',
            title: `IDEA ${index + 1}`,
            titleAlignment: 'center'
          }));
        });

        console.log(chalk.green.bold(`\n✅ Generated ${ideas.length} premium ideas!`));
        console.log(chalk.gray(`Full JSON saved to: ${outputPath}`));

        if (options.images) {
          console.log(chalk.green('\n🎨 DALL-E 3 images have been generated and saved to the ./images/ folder!'));
        } else {
          console.log(chalk.yellow('\n💡 Pro tip: Use --images flag to generate + automatically save DALL-E 3 images locally.'));
        }

        console.log(chalk.cyan('\nImage-first workflow:'));
        console.log(chalk.gray('1. Run with --images flag → images saved to ./images/ folder'));
        console.log(chalk.gray('2. Use the printReadyPrompt and colorStrategy for production'));
        console.log(chalk.gray('3. Test designs on both black and white mockups in Printify'));
        console.log(chalk.gray('4. All image prompts are optimized for high contrast on light AND dark clothing'));
      } else {
        console.log(JSON.stringify(ideas, null, 2));
      }
    } catch (error) {
      console.error(chalk.red('Generation failed:'), error);
      process.exit(1);
    }
  });

program.parse();
