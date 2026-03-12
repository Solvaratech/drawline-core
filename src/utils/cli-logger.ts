import chalk from "chalk";

export const cliLogger = {
	info: (msg: string) => console.log(chalk.blue("ℹ ") + msg),
	success: (msg: string) => console.log(chalk.green("✔ ") + msg),
	warn: (msg: string) => console.log(chalk.yellow("⚠ ") + msg),
	error: (msg: string, err?: any) => {
		console.error(chalk.red("✖ ") + msg);
		if (err) console.error(err);
	},
	bold: (msg: string) => console.log(chalk.bold(msg)),
	header: (msg: string) => {
		console.log("\n" + chalk.cyan.bold("=== " + msg + " ==="));
	},
	step: (msg: string) => console.log(chalk.magenta("→ ") + msg),
};
